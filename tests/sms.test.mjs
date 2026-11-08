import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import supertest from "supertest";
import { openDatabase } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
import { tokenMatches } from "../server/sms.mjs";
import { SMS_RATE_LIMIT } from "../server/sms-ingest.mjs";

const TOKEN = "sms-test-token-not-a-real-secret-value";
const origin = "http://localhost:5173";
const NO_CODE =
  "Tany 5***0218 dansand ORLOGO:5,000.00MNT orj ULDEGDEL:5,010.00MNT bolloo.Utga:sms";
const WITH_CODE =
  "Tany 5***0218 dansand ORLOGO:5,000.00MNT orj ULDEGDEL:5,010.00MNT bolloo.Utga:ES-4821";

function fixture(token = TOKEN) {
  const db = openDatabase(":memory:");
  let clock = Date.parse("2026-11-06T12:00:00+08:00");
  let pending;
  const oauthClient = {
    generateAuthUrl(opts) {
      pending = opts;
      return `https://accounts.google.com/o/oauth2/v2/auth?state=${opts.state}`;
    },
    async getToken({ code }) {
      return { tokens: { id_token: code } };
    },
    async verifyIdToken({ idToken }) {
      return {
        getPayload: () => ({
          sub: idToken,
          email: `${idToken}@example.com`,
          name: idToken,
          email_verified: true,
          nonce: pending.nonce,
        }),
      };
    },
  };
  const app = createApp({
    db,
    config: {
      origin,
      sessionSecret: "test-secret-only-at-least-thirty-two-characters",
      googleClientId: "test-client",
      googleClientSecret: "test-secret",
      redirectUri: "http://localhost:5173/api/auth/google/callback",
      adminEmails: "owner@example.com",
      ownerGoogleSub: "owner",
      smsWebhookToken: token,
    },
    oauthClient,
    now: () => clock,
  });
  return { db, app, agent: () => supertest.agent(app) };
}
async function login(agent, name) {
  const begin = await agent.get("/api/auth/google").expect(302);
  const state = new URL(begin.headers.location).searchParams.get("state");
  await agent
    .get(`/api/auth/google/callback?state=${state}&code=${name}`)
    .expect(302);
  return (await agent.get("/api/session").expect(200)).body;
}
const postSms = (app, text, extra = {}, token = TOKEN) => {
  const req = supertest(app)
    .post("/api/payments/sms")
    .set("Content-Type", "application/json");
  if (token != null) req.set("X-SMS-Token", token);
  return req.send({ text, ...extra });
};

test("token compare is timing-safe and fails closed", () => {
  const source = tokenMatches.toString();
  assert.equal(source.includes("timingSafeEqual"), true);
  assert.equal(source.includes("header ==="), false);
  assert.equal(source.includes("secret ==="), false);
  assert.equal(tokenMatches(undefined, TOKEN), false);
  assert.equal(tokenMatches("nope", ""), false);
  assert.equal(tokenMatches("short", TOKEN), false);
  assert.equal(tokenMatches(`${TOKEN.slice(0, -1)}x`, TOKEN), false);
  assert.equal(tokenMatches(TOKEN, TOKEN), true);
});

test("SMS auth fails closed and does not change orders", async () => {
  const open = fixture();
  const closed = fixture("");
  const before = await open.db.all("SELECT * FROM orders");
  await supertest(open.app).post("/api/payments/sms").send({ text: NO_CODE }).expect(401);
  const wrong = await postSms(open.app, NO_CODE, {}, `${TOKEN.slice(0, -1)}x`).expect(401);
  assert.deepEqual(wrong.body, { ok: false, error: "unauthorized" });
  const unset = await postSms(closed.app, NO_CODE).expect(401);
  assert.equal(unset.body.error, "unauthorized");
  assert.equal((await open.db.all("SELECT * FROM orders")).length, before.length);
  assert.equal((await open.db.all("SELECT * FROM sms_payment_events")).length, 0);
  assert.equal((await closed.db.all("SELECT * FROM sms_payment_events")).length, 0);
  open.db.close();
  closed.db.close();
});

test("SMS post needs no session and other mutations stay protected", async () => {
  const f = fixture();
  const student = f.agent();
  const owner = f.agent();
  const s = await login(student, "payer");
  const o = await login(owner, "owner");
  const opened = await postSms(f.app, NO_CODE).expect(200);
  assert.equal(opened.body.status, "unmatched");
  assert.equal(opened.headers["access-control-allow-origin"], undefined);
  await student.post("/api/orders").send({ plan: "week", group: 1 }).expect(403);
  await owner
    .post("/api/admin/orders/approve")
    .send({ code: "ES-4821", note: "Messenger screenshot" })
    .expect(403);
  await student.get("/api/tests/sat/1").expect(403);
  const missing = await owner
    .post("/api/admin/orders/approve")
    .set("x-csrf-token", o.csrf)
    .set("Origin", origin)
    .send({ code: "ES-0000", note: "Messenger screenshot" });
  assert.equal(missing.status, 400, JSON.stringify(missing.body));
  assert.ok(s.user);
  f.db.close();
});

test("SMS body validation and non-matching bank texts stay unpaid", async () => {
  const f = fixture();
  const student = f.agent();
  const s = await login(student, "payer");
  await student
    .post("/api/orders")
    .set("x-csrf-token", s.csrf)
    .set("Origin", origin)
    .send({ plan: "week", group: 1 })
    .expect(200);
  await postSms(f.app, undefined).expect(400);
  await postSms(f.app, "   ").expect(400);
  await postSms(f.app, "x".repeat(2001)).expect(400);
  await supertest(f.app)
    .post("/api/payments/sms")
    .set("Content-Type", "application/json")
    .set("X-SMS-Token", TOKEN)
    .send("{")
    .expect(400);
  await supertest(f.app).get("/api/payments/sms").expect(404);
  const noCode = await postSms(f.app, NO_CODE, { received_at: "yesterday" }).expect(200);
  assert.equal(noCode.body.status, "unmatched");
  assert.equal(noCode.body.reason, "no_code");
  const stored = await f.db.get("SELECT * FROM sms_payment_events WHERE id=?", [
    noCode.body.eventId,
  ]);
  assert.equal(stored.phone_received_at, null);
  assert.equal(Number(stored.server_received_at) > 0, true);
  assert.equal(stored.utga, "sms");
  assert.equal(String(stored.sms_hash).length, 64);
  const dated = await postSms(f.app, NO_CODE.replace("Utga:sms", "Utga:note"), {
    received_at: "2026-11-06T11:00:00+08:00",
  }).expect(200);
  const datedRow = await f.db.get("SELECT phone_received_at FROM sms_payment_events WHERE id=?", [
    dated.body.eventId,
  ]);
  assert.equal(datedRow.phone_received_at, "2026-11-06T11:00:00+08:00");
  const wrongAccount = await postSms(f.app, NO_CODE.replace("0218", "9999")).expect(200);
  assert.equal(wrongAccount.body.status, "rejected");
  const debit = await postSms(
    f.app,
    "Tany 5***0218 dansand ZARLAGA:2,000.00MNT garch ULDEGDEL:98,510.00MNT bolloo.Utga:hool",
  ).expect(200);
  assert.equal(debit.body.status, "rejected");
  const other = await postSms(f.app, "Hello, your package is waiting").expect(200);
  assert.equal(other.body.status, "rejected");
  const order = await f.db.get("SELECT status FROM orders");
  assert.equal(order.status, "awaiting_payment");
  f.db.close();
});

test("an exact unpaid order activates once and a mismatch does not", async () => {
  const f = fixture();
  const student = f.agent();
  const s = await login(student, "payer");
  const created = (
    await student
      .post("/api/orders")
      .set("x-csrf-token", s.csrf)
      .set("Origin", origin)
      .send({ plan: "week", group: 1 })
      .expect(200)
  ).body;
  await f.db.run("UPDATE orders SET code=?, amount_mnt=? WHERE code=?", [
    "ES-4821",
    5000,
    created.code,
  ]);
  const low = await postSms(
    f.app,
    WITH_CODE.replace("5,000.00", "4,999.99"),
  ).expect(200);
  assert.equal(low.body.status, "unmatched");
  const high = await postSms(f.app, WITH_CODE.replace("5,000.00", "5,001.00")).expect(200);
  assert.equal(high.body.status, "unmatched");
  assert.equal(high.body.reason, "amount_mismatch");
  assert.equal((await f.db.get("SELECT status FROM orders WHERE code='ES-4821'")).status, "awaiting_payment");
  const paid = await postSms(f.app, WITH_CODE).expect(200);
  assert.equal(paid.body.status, "activated");
  assert.equal(paid.body.orderCode, "ES-4821");
  const again = await postSms(f.app, WITH_CODE).expect(200);
  assert.equal(again.body.status, "duplicate");
  const different = await postSms(f.app, WITH_CODE.replace("bolloo.", "bolloo. ")).expect(200);
  assert.equal(different.body.status, "unmatched");
  assert.equal(different.body.reason, "already_paid");
  assert.equal(
    (await f.db.all("SELECT source FROM entitlements WHERE source='sms'")).length,
    1,
  );
  await student.get("/api/tests/ielts/1").expect(200);
  await student.get("/api/tests/toefl/1").expect(200);
  await student.get("/api/tests/sat/1").expect(200);
  const unknown = await postSms(f.app, WITH_CODE.replace("ES-4821", "ES-9999")).expect(200);
  assert.equal(unknown.body.reason, "unknown_order");
  f.db.close();
});

test("parallel identical SMS texts activate one order", async () => {
  const f = fixture();
  const student = f.agent();
  const s = await login(student, "payer");
  const created = (
    await student
      .post("/api/orders")
      .set("x-csrf-token", s.csrf)
      .set("Origin", origin)
      .send({ plan: "week", group: 1 })
      .expect(200)
  ).body;
  await f.db.run("UPDATE orders SET code=?, amount_mnt=? WHERE code=?", [
    "ES-4821",
    5000,
    created.code,
  ]);
  const replies = await Promise.all([
    postSms(f.app, WITH_CODE),
    postSms(f.app, WITH_CODE),
  ]);
  assert.deepEqual(
    replies.map((reply) => reply.body.status).sort(),
    ["activated", "duplicate"],
  );
  assert.equal((await f.db.all("SELECT id FROM entitlements")).length, 1);
  f.db.close();
});

test("two different SMS texts with the same amount are both processed", async () => {
  const f = fixture();
  const first = f.agent();
  const second = f.agent();
  const a = await login(first, "one");
  const b = await login(second, "two");
  for (const [agent, session, code] of [
    [first, a, "ES-1111"],
    [second, b, "ES-2222"],
  ]) {
    const created = (
      await agent
        .post("/api/orders")
        .set("x-csrf-token", session.csrf)
        .set("Origin", origin)
        .send({ plan: "week", group: 1 })
        .expect(200)
    ).body;
    await f.db.run("UPDATE orders SET code=?, amount_mnt=? WHERE code=?", [
      code,
      5000,
      created.code,
    ]);
  }
  const left = await postSms(f.app, WITH_CODE.replace("ES-4821", "ES-1111")).expect(200);
  const right = await postSms(f.app, WITH_CODE.replace("ES-4821", "ES-2222")).expect(200);
  assert.equal(left.body.status, "activated");
  assert.equal(right.body.status, "activated");
  assert.equal((await f.db.all("SELECT id FROM entitlements")).length, 2);
  f.db.close();
});

test("admin reviews unmatched SMS and manual approval still works", async () => {
  const f = fixture();
  const student = f.agent();
  const owner = f.agent();
  const stranger = f.agent();
  const s = await login(student, "payer");
  const o = await login(owner, "owner");
  const strangerSession = await login(stranger, "stranger");
  const created = (
    await student
      .post("/api/orders")
      .set("x-csrf-token", s.csrf)
      .set("Origin", origin)
      .send({ plan: "week", group: 1 })
      .expect(200)
  ).body;
  const queued = await postSms(f.app, NO_CODE).expect(200);
  await stranger.get("/api/admin").expect(403);
  await stranger
    .post("/api/admin/sms/dismiss")
    .set("x-csrf-token", strangerSession.csrf)
    .set("Origin", origin)
    .send({ id: queued.body.eventId, note: "not an admin" })
    .expect(403);
  const admin = (await owner.get("/api/admin").expect(200)).body;
  assert.equal(admin.sms.length, 1);
  assert.equal(admin.sms[0].amount_mnt, 5000);
  assert.equal(admin.sms[0].utga, "sms");
  await owner
    .post("/api/admin/sms/dismiss")
    .send({ id: queued.body.eventId, note: "reviewed in person" })
    .expect(403);
  const mismatch = await owner
    .post("/api/admin/sms/link")
    .set("x-csrf-token", o.csrf)
    .set("Origin", origin)
    .send({ id: queued.body.eventId, code: created.code, note: "wrong amount row" })
    .expect(400);
  assert.equal(mismatch.body.error, "amount_mismatch");
  await f.db.run("UPDATE orders SET amount_mnt=? WHERE code=?", [5000, created.code]);
  await owner
    .post("/api/admin/sms/link")
    .set("x-csrf-token", o.csrf)
    .set("Origin", origin)
    .send({ id: queued.body.eventId, code: created.code, note: "linked from SMS" })
    .expect(200);
  await student.get("/api/tests/ielts/1").expect(200);
  const second = (
    await student
      .post("/api/orders")
      .set("x-csrf-token", s.csrf)
      .set("Origin", origin)
      .send({ plan: "week", group: 1 })
      .expect(200)
  ).body;
  const extra = await postSms(f.app, NO_CODE.replace("5,010.00", "5,020.00")).expect(200);
  await owner
    .post("/api/admin/sms/dismiss")
    .set("x-csrf-token", o.csrf)
    .set("Origin", origin)
    .send({ id: extra.body.eventId, note: "not this student" })
    .expect(200);
  assert.equal(
    (await owner.get("/api/admin")).body.sms.some((row) => row.id === extra.body.eventId),
    false,
  );
  await owner
    .post("/api/admin/orders/approve")
    .set("x-csrf-token", o.csrf)
    .set("Origin", origin)
    .send({ code: second.code, note: "Messenger screenshot" })
    .expect(200);
  assert.equal((await f.db.get("SELECT status FROM orders WHERE code=?", [second.code])).status, "paid");
  f.db.close();
});

test("SMS rate limit is durable for one address", async () => {
  const f = fixture();
  for (let i = 0; i < SMS_RATE_LIMIT; i += 1)
    await supertest(f.app).post("/api/payments/sms").send({ text: NO_CODE }).expect(401);
  const limited = await supertest(f.app)
    .post("/api/payments/sms")
    .set("X-SMS-Token", TOKEN)
    .send({ text: NO_CODE })
    .expect(429);
  assert.equal(limited.body.error, "rate_limited");
  f.db.close();
});

test("SMS ingest does not hardcode prices or log the message", () => {
  const source = fs.readFileSync(new URL("../server/sms-ingest.mjs", import.meta.url), "utf8");
  const route = fs.readFileSync(new URL("../server/app.mjs", import.meta.url), "utf8");
  assert.equal(/\b(3500|5000|10000|20000)\b/.test(source), false);
  assert.equal(source.includes("console.log"), false);
  assert.equal(route.includes('console.log'), false);
  assert.equal(route.includes("tokenMatches(req.get(\"x-sms-token\")"), true);
  const docs = fs.readFileSync(new URL("../docs/sms-payments.md", import.meta.url), "utf8");
  assert.equal(docs.includes("SMS_WEBHOOK_TOKEN"), true);
  assert.equal(docs.includes("not an OTP") || docs.includes("never one-time passwords"), true);
  assert.equal(docs.includes("ULDEGDEL"), true);
  const example = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.equal(example.includes("SMS_WEBHOOK_TOKEN="), true);
  assert.equal(/SMS_WEBHOOK_TOKEN=.+/.test(example), false);
});
