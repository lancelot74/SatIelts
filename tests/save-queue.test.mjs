import test from "node:test";
import assert from "node:assert/strict";
import {
  KEEPALIVE_LIMIT,
  createSaveQueue,
  deliverSave,
  deliveryMode,
  nextDelay,
} from "../src/save-queue.js";

test("saves stay in order even when the first request is slower", async () => {
  const queue = createSaveQueue();
  const seen = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const first = queue.enqueue(async () => {
    seen.push("start-a");
    await gate;
    seen.push("end-a");
    return "a";
  });
  const second = queue.enqueue(async () => {
    seen.push("b");
    return "b";
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, ["start-a"]);
  release();
  assert.equal(await first, "a");
  assert.equal(await second, "b");
  assert.deepEqual(seen, ["start-a", "end-a", "b"]);
});

test("continuous typing still flushes after the maximum wait", () => {
  const start = 1_000;
  assert.equal(nextDelay(start, start, 60_000), 1500);
  assert.equal(nextDelay(start + 4_000, start, 60_000), 1000);
  assert.equal(nextDelay(start + 5_000, start, 60_000), 0);
  assert.equal(nextDelay(start, start, 2000), 0);
});

test("a body over the keepalive budget uses a normal fetch", () => {
  const small = deliveryMode("{}", { unloading: true });
  assert.equal(small.keepalive, true);
  assert.equal(small.beacon, true);
  const large = "x".repeat(KEEPALIVE_LIMIT);
  const mode = deliveryMode(large, { unloading: true });
  assert.equal(mode.keepalive, false);
  assert.equal(mode.beacon, false);
  assert.ok(mode.bytes >= KEEPALIVE_LIMIT);
});

test("an http error does not count as a saved revision", async () => {
  await assert.rejects(
    deliverSave({
      fetchImpl: async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: "server_error" }),
      }),
      url: "/api/runs/1/answers",
      payload: { answers: { 0: 1 }, revision: 2, csrf: "token" },
    }),
    (error) => error.status === 500,
  );
});

test("a rejected keepalive fetch can fall back to sendBeacon", async () => {
  let beaconBody = null;
  const result = await deliverSave({
    fetchImpl: async () => {
      throw new Error("network");
    },
    beacon: (_url, body) => {
      beaconBody = body;
      return true;
    },
    url: "/api/runs/1/answers",
    payload: { answers: { 0: 1 }, revision: 2, csrf: "token" },
    unloading: true,
  }).catch((error) => error);
  assert.equal(result.beacon, true);
  assert.ok(beaconBody);
});
