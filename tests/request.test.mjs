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
    await assert.rejects(request(url, { signal: caller.signal, timeoutMs: 150 }), (error) => {
      assert.equal(error.name, "TimeoutError");
      assert.equal(error.message, "request timed out");
      assert.equal(gaveUp(error, { aborted: false }), true);
      return true;
    });
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
    await assert.rejects(request(url, { timeoutMs: 150 }), (error) => {
      assert.equal(error.name, "TimeoutError");
      assert.equal(error.message, "request timed out");
      return true;
    });
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
  } finally {
    await close();
  }
});

test("an abort during the retry wait does not send another request", async () => {
  let reads = 0;
  const { url, close } = await serve((_req, res) => {
    reads += 1;
    res.writeHead(500, { "content-type": "application/json" });
    res.end('{"error":"server_error"}');
  });
  const caller = new AbortController();
  const reason = new Error("stop please");
  reason.name = "AbortError";
  try {
    const pending = request(url, { signal: caller.signal, timeoutMs: 5000 });
    setTimeout(() => caller.abort(reason), 80);
    await assert.rejects(pending, (error) => error === reason);
    assert.equal(reads, 1);
    caller.abort(reason);
    const again = request(url, { signal: caller.signal, timeoutMs: 5000 });
    await assert.rejects(again, (error) => error === reason);
    assert.equal(reads, 1);
  } finally {
    await close();
  }
});

test("timeout and abort reasons are specific", () => {
  const timeout = new Error("request timed out");
  timeout.name = "TimeoutError";
  assert.equal(gaveUp(timeout, { aborted: false }), true);
  assert.equal(gaveUp(new Error("socket hang up"), { aborted: false }), false);
});
