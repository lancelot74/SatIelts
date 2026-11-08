import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { gaveUp, request } from "../src/request.js";

function serve(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/api/session`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

test("a caller signal does not turn off the deadline", async () => {
  const pending = serve(() => {});
  const { url, close } = await pending;
  const caller = new AbortController();
  const started = Date.now();
  try {
    await assert.rejects(
      request(url, { signal: caller.signal, timeoutMs: 150 }),
      (error) => gaveUp(error, { aborted: true }) || error.name === "AbortError",
    );
    assert.ok(Date.now() - started < 800);
  } finally {
    caller.abort();
    await close();
  }
});

test("a stalled body and a missing AbortSignal.timeout still stop", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
  Object.defineProperty(AbortSignal, "timeout", {
    configurable: true,
    value() {
      throw new Error("AbortSignal.timeout is unavailable");
    },
  });
  const { url, close } = await serve((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.write('{"ok":');
  });
  const started = Date.now();
  try {
    await assert.rejects(request(url, { timeoutMs: 150 }));
    assert.ok(Date.now() - started < 800);
  } finally {
    if (descriptor) Object.defineProperty(AbortSignal, "timeout", descriptor);
    await close();
  }
});

test("an aborted read is not tried again and a failed mutation is not retried", async () => {
  let reads = 0;
  let writes = 0;
  const { url, close } = await serve((req, res) => {
    if (req.method === "POST") {
      writes += 1;
      res.writeHead(500, { "content-type": "application/json" });
      res.end('{"error":"server_error"}');
      return;
    }
    reads += 1;
    if (reads < 3) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end('{"error":"server_error"}');
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
  });
  try {
    assert.equal((await request(url, { timeoutMs: 1000 })).ok, true);
    assert.equal(reads, 3);
    await assert.rejects(
      request(url, { method: "POST", body: "{}", timeoutMs: 1000 }),
    );
    assert.equal(writes, 1);
    const caller = new AbortController();
    const hung = serve(() => {});
    const slow = await hung;
    const started = Date.now();
    const pending = request(slow.url, { signal: caller.signal, timeoutMs: 5000 });
    caller.abort();
    await assert.rejects(pending);
    assert.ok(Date.now() - started < 500);
    await slow.close();
  } finally {
    await close();
  }
});

test("a generic error is terminal when the deadline signal already aborted", () => {
  assert.equal(gaveUp(new Error("The operation was aborted"), { aborted: true }), true);
  assert.equal(gaveUp(new Error("socket hang up"), { aborted: false }), false);
});
