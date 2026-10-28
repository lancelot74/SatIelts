import test from "node:test";
import assert from "node:assert/strict";
import { offer, planCode, saleActive, SALE_END } from "../src/config/pricing.js";

test("sale prices stack and then return to the friends rate", () => {
  const during = offer(Date.parse("2026-11-08T23:00:00+08:00"));
  assert.equal(during.sale, true);
  assert.equal(during.solo.week.price, 3500);
  assert.equal(during.solo.month.price, 10000);
  assert.equal(during.friends.week.total, 8400);
  assert.equal(during.friends.week.each, 2800);
  assert.equal(during.friends.month.total, 24000);
  assert.equal(during.friends.month.each, 8000);
  const after = offer(SALE_END);
  assert.equal(after.sale, false);
  assert.equal(saleActive(SALE_END), false);
  assert.equal(after.solo.month.price, 20000);
  assert.equal(after.friends.month.total, 48000);
  assert.equal(after.friends.week.each, 5600);
  assert.equal(planCode("month", "3"), "month-3");
  assert.equal(planCode("week", "1"), "week");
  assert.equal(planCode("year", "3"), null);
});
