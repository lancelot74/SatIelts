import test from "node:test";
import assert from "node:assert/strict";
import { createBootGate } from "../server/boot-gate.mjs";

test("a missing migration is retried after the backoff and other failures stay failed", async () => {
  let calls = 0;
  let now = 0;
  const gate = createBootGate({
    now: () => now,
    backoffMs: 5000,
    boot: async () => {
      calls += 1;
      if (calls < 2) throw new Error("migration required: 2026-11-10-runtime");
      return { listening: true };
    },
  });
  const first = await gate();
  assert.equal(first.error.error, "migration_required");
  assert.equal(first.error.retry, true);
  const second = await gate();
  assert.equal(calls, 1);
  assert.equal(second.error.error, "migration_required");
  now = 5000;
  const third = await gate();
  assert.equal(third.app.listening, true);
  assert.equal(calls, 2);

  let fatalCalls = 0;
  const fatal = createBootGate({
    now: () => 0,
    boot: async () => {
      fatalCalls += 1;
      throw new Error("set SESSION_SECRET");
    },
  });
  await fatal();
  await fatal();
  assert.equal(fatalCalls, 1);
});
