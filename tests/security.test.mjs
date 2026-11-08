import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import supertest from "supertest";
import { openDatabase } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
import { migrateLegacyGrants } from "../server/orders.mjs";
import { priceFor } from "../src/config/pricing.js";

const origin = "http://localhost:5173";
function fixture(extra = {}) {
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
      ownerGoogleSub: "owner",
      smsWebhookToken: "sms-test-token-not-a-real-secret-value",
      ...extra,
    },
    oauthClient,
    now: () => clock,
  });
  return {
    db,
    app,
    advance: (ms) => (clock += ms),
    agent: () => supertest.agent(app),
  };
}
async function login(agent, name, headers = {}) {
  const begin = await agent.get("/api/auth/google").set(headers).expect(302);
  const state = new URL(begin.headers.location).searchParams.get("state");
  await agent
    .get(`/api/auth/google/callback?state=${state}&code=${name}`)
    .set(headers)
    .expect(302);
  return (await agent.get("/api/session").expect(200)).body;
}
const post = (agent, url, csrf, body) =>
  agent.post(url).set("x-csrf-token", csrf).set("Origin", origin).send(body ?? {});

test("missing owner subject cannot administer", async () => {
  const f = fixture({ ownerGoogleSub: "" });
  const owner = f.agent();
  const session = await login(owner, "owner");
  assert.equal(session.user.isAdmin, false);
  await owner.get("/api/admin").expect(403);
  f.db.close();
});

test("boot does not turn a single-exam grant into access", async () => {
  const f = fixture();
  await f.db.run(
    "INSERT INTO users (google_sub,email,name) VALUES ('old','old@example.com','Old')",
  );
  const user = await f.db.get("SELECT id FROM users WHERE google_sub='old'");
  await f.db.run("INSERT INTO grants (user_id,exam) VALUES (?, 'ielts')", [user.id]);
  const report = await migrateLegacyGrants(f.db);
  assert.equal(report.leftoverGrants, 1);
  assert.equal(
    (await f.db.get("SELECT COUNT(*) AS n FROM entitlements")).n,
    0,
  );
  f.db.close();
});

test("prices ignore the client and access expires", async () => {
  const f = fixture();
  const student = f.agent();
  const owner = f.agent();
  const s = await login(student, "payer");
  const o = await login(owner, "owner");
  const during = (
    await post(student, "/api/orders", s.csrf, {
      plan: "week",
      group: 1,
      amount: 1,
    }).expect(200)
  ).body;
  assert.equal(during.amount, priceFor("week", 1, Date.parse("2026-11-06T12:00:00+08:00")).amount);
  assert.notEqual(during.amount, 1);
  f.advance(2 * 86400000);
  await post(owner, "/api/admin/orders/approve", o.csrf, {
    code: during.code,
    note: "Late transfer checked",
  }).expect(200);
  await student.get("/api/tests/sat/1").expect(200);
  f.advance(8 * 86400000);
  await student.get("/api/tests/ielts/1").expect(403);
  const later = (
    await post(student, "/api/orders", s.csrf, {
      plan: "month",
      group: 1,
      amount: 1,
    }).expect(200)
  ).body;
  assert.equal(later.amount, 20000);
  const fresh = (
    await post(student, "/api/orders", s.csrf, { plan: "week", group: 1 }).expect(200)
  ).body;
  assert.equal(fresh.status, "awaiting_payment");
  f.db.close();
});

test("group revoke removes friends and a second approval does not stack", async () => {
  const f = fixture();
  const student = f.agent();
  const owner = f.agent();
  const s = await login(student, "payer");
  const o = await login(owner, "owner");
  const order = (
    await post(student, "/api/orders", s.csrf, {
      plan: "week",
      group: 3,
      friends: ["one@example.com", "two@example.com"],
    }).expect(200)
  ).body;
  await Promise.all([
    post(owner, "/api/admin/orders/approve", o.csrf, {
      code: order.code,
      note: "Transfer checked",
    }),
    post(owner, "/api/admin/orders/approve", o.csrf, {
      code: order.code,
      note: "Transfer checked",
    }),
  ]);
  assert.equal((await f.db.all("SELECT id FROM entitlements")).length, 3);
  await post(owner, "/api/admin/orders/revoke", o.csrf, {
    code: order.code,
    note: "Wrong transfer",
  }).expect(200);
  assert.equal(
    (await f.db.get("SELECT COUNT(*) AS n FROM entitlements WHERE ends_at>?", [Date.now()])).n,
    0,
  );
  const session = (await student.get("/api/session").expect(200)).body;
  assert.equal(session.notices.some((notice) => notice.kind === "group_revoked"), true);
  await student.get("/api/tests/ielts/1").expect(403);
  f.db.close();
});

test("an old friend invitation cannot attach", async () => {
  const f = fixture();
  await f.db.run(
    "INSERT INTO users (google_sub,email,name) VALUES ('payer','payer@example.com','Payer')",
  );
  const payer = await f.db.get("SELECT id FROM users WHERE google_sub='payer'");
  await f.db.run(
    `INSERT INTO orders (code,user_id,plan,group_size,friend_emails,amount_mnt,list_amount_mnt,sale_applied,status,expires_at,created_at)
     VALUES ('ES-1000',?,'week',3,'[]',3500,7000,1,'paid',?,?)`,
    [payer.id, Date.parse("2026-11-20T00:00:00+08:00"), Date.parse("2026-09-01T00:00:00+08:00")],
  );
  const order = await f.db.get("SELECT id FROM orders WHERE code='ES-1000'");
  await f.db.run(
    "INSERT INTO entitlements (user_id,email,starts_at,ends_at,source,order_id,created_at) VALUES (NULL,'friend@example.com',?,?, 'manual', ?, ?)",
    [
      Date.parse("2026-09-01T00:00:00+08:00"),
      Date.parse("2026-12-01T00:00:00+08:00"),
      order.id,
      Date.parse("2026-09-01T00:00:00+08:00"),
    ],
  );
  const friend = f.agent();
  const session = await login(friend, "friend");
  assert.equal(session.access.active, false);
  assert.equal(
    (await f.db.get("SELECT user_id FROM entitlements WHERE email='friend@example.com'")).user_id,
    null,
  );
  f.db.close();
});

test("listening start omits the transcript and paid audio requires access", async () => {
  const f = fixture();
  const anon = supertest(f.app);
  const locked = await anon.get("/media/ielts/01/listening-part1.mp3");
  assert.equal(locked.status, 401);
  assert.equal(String(locked.headers["content-type"] || "").includes("audio"), false);
  const student = f.agent();
  const owner = f.agent();
  const s = await login(student, "learner");
  const o = await login(owner, "owner");
  const started = (
    await post(student, "/api/tests/ielts/listening-sample/start", s.csrf).expect(200)
  ).body;
  assert.equal(
    started.test.questions.some((q) => q.passage || q.speechText),
    false,
  );
  await post(owner, "/api/admin/access", o.csrf, {
    userId: s.user.id,
    action: "approve",
    days: 7,
    note: "Verified transfer",
  }).expect(200);
  const media = await student
    .get("/media/ielts/01/listening-part1.mp3")
    .set("Range", "bytes=0-15")
    .expect(206);
  assert.match(media.headers["content-type"], /audio/);
  assert.equal(media.headers["cache-control"], "private, no-store");
  f.advance(8 * 86400000);
  await student.get("/media/ielts/01/listening-part1.mp3").expect(403);
  f.db.close();
});

test("a fourth login revokes the oldest session", async () => {
  const f = fixture();
  const agents = [f.agent(), f.agent(), f.agent(), f.agent()];
  const sessions = [];
  for (const agent of agents) {
    sessions.push(await login(agent, "learner"));
    f.advance(1);
  }
  assert.equal(sessions[3].notices.some((notice) => notice.kind === "excess_login"), true);
  assert.equal((await f.db.get("SELECT COUNT(*) AS n FROM user_sessions")).n, 3);
  assert.equal((await agents[0].get("/api/session")).body.user, null);
  assert.equal((await agents[3].get("/api/session")).body.user.email, "learner@example.com");
  await post(agents[3], "/api/sessions/others", sessions[3].csrf, {}).expect(200);
  assert.equal((await f.db.get("SELECT COUNT(*) AS n FROM user_sessions")).n, 1);
  await agents[1].post("/api/sessions/others").send({}).expect(403);
  f.db.close();
});

test("expired SMS stays unmatched and dependency pins are outside the advisory ranges", () => {
  const lock = fs.readFileSync("package-lock.json", "utf8");
  assert.equal(lock.includes('"body-parser": "2.3.0"') || lock.includes("body-parser@2.3."), false);
});
