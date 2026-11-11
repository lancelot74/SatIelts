import test from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { openDatabase, poolMax, SqliteSessionStore } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
import { listNotices } from "../server/sessions.mjs";

const origin = "http://localhost:5173";
const config = {
  origin,
  sessionSecret: "test-secret-only-at-least-thirty-two-characters",
  googleClientId: "test-client",
  googleClientSecret: "test-secret",
  redirectUri: "http://localhost:5173/api/auth/google/callback",
  ownerGoogleSub: "owner",
};

function fixture() {
  const db = openDatabase(":memory:");
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
  const app = createApp({ db, config, oauthClient, now: () => Date.now() });
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

const post = (agent, url, csrf) =>
  agent.post(url).set("x-csrf-token", csrf).set("Origin", origin);

test("pool size defaults to 5 and rejects an unsafe value", () => {
  assert.equal(poolMax({}), 5);
  assert.equal(poolMax({ PG_POOL_MAX: "" }), 5);
  assert.equal(poolMax({ PG_POOL_MAX: "8" }), 8);
  assert.throws(() => poolMax({ PG_POOL_MAX: "0" }), /invalid PG_POOL_MAX/);
  assert.throws(() => poolMax({ PG_POOL_MAX: "21" }), /invalid PG_POOL_MAX/);
  assert.throws(() => poolMax({ PG_POOL_MAX: "nope" }), /invalid PG_POOL_MAX/);
});

test("anonymous catalog, guides, and session do not persist a session", async () => {
  const { db, agent } = fixture();
  const visitor = agent();
  const catalog = await visitor.get("/api/catalog").expect(200);
  assert.equal(
    catalog.headers["cache-control"],
    "public, s-maxage=300, stale-while-revalidate=86400",
  );
  assert.equal(JSON.stringify(catalog.body).includes('"answer"'), false);
  const guide = await visitor.get("/api/guides/ielts").expect(200);
  assert.equal(
    guide.headers["cache-control"],
    catalog.headers["cache-control"],
  );
  assert.equal(guide.body.source.includes("IELTS"), true);
  const session = await visitor.get("/api/session").expect(200);
  assert.equal(session.body.user, null);
  assert.ok(session.body.csrf);
  const cookies = [].concat(session.headers["set-cookie"] || []).join(";");
  assert.match(cookies, /studyroom\.csrf=/);
  assert.equal(cookies.includes("studyroom.sid"), false);
  assert.equal(
    Number((await db.get("SELECT COUNT(*) AS n FROM sessions")).n),
    0,
  );
  await visitor
    .post("/api/tests/ielts/sample/start")
    .set("Origin", origin)
    .expect(403);
  await post(
    visitor,
    "/api/tests/ielts/sample/start",
    session.body.csrf,
  ).expect(200);
  assert.equal(
    Number((await db.get("SELECT COUNT(*) AS n FROM sessions")).n),
    1,
  );
  const again = await post(
    visitor,
    "/api/tests/ielts/sample/start",
    session.body.csrf,
  ).expect(200);
  assert.equal(again.body.runId.length > 0, true);
  assert.equal(
    Number((await db.get("SELECT COUNT(*) AS n FROM sessions")).n),
    1,
  );
  db.close();
});

test("a revoked session is rejected on the next request", async () => {
  const { db, agent } = fixture();
  const learner = agent();
  const session = await login(learner, "learner");
  assert.equal(session.user.email, "learner@example.com");
  await db.run("DELETE FROM user_sessions");
  const after = await learner.get("/api/session").expect(200);
  assert.equal(after.body.user, null);
  db.close();
});

test("signed-in test reads stay within a few queries and do not rewrite the session", async () => {
  const { db, agent } = fixture();
  const learner = agent();
  await login(learner, "learner");
  const user = await db.get("SELECT id FROM users WHERE email=?", [
    "learner@example.com",
  ]);
  const now = Date.now();
  await db.run(
    "INSERT INTO entitlements (user_id,email,starts_at,ends_at,source,created_at) VALUES (?,?,?,?,?,?)",
    [user.id, "learner@example.com", now - 1000, now + 86400000, "manual", now],
  );
  let reads = 0;
  let sessionWrites = 0;
  const originalGet = db.get.bind(db);
  const originalRun = db.run.bind(db);
  db.get = (sql, params) => {
    reads += 1;
    return originalGet(sql, params);
  };
  db.run = (sql, params) => {
    if (String(sql).includes("sessions")) sessionWrites += 1;
    return originalRun(sql, params);
  };
  await learner.get("/api/tests/ielts/listening-1").expect(200);
  assert.ok(reads <= 3, `expected at most 3 reads, saw ${reads}`);
  assert.equal(sessionWrites, 0);
  db.close();
});

test("signed-in start limit is per user and a second account is not blocked", async () => {
  const { db, agent } = fixture();
  const first = agent();
  const second = agent();
  const a = await login(first, "a-student");
  const b = await login(second, "b-student");
  for (let i = 0; i < 20; i += 1)
    await post(first, "/api/tests/ielts/listening-sample/start", a.csrf).expect(
      200,
    );
  await post(first, "/api/tests/ielts/listening-sample/start", a.csrf).expect(
    429,
  );
  await post(second, "/api/tests/ielts/listening-sample/start", b.csrf).expect(
    200,
  );
  db.close();
});

test("notices from the user id and the email both show, once each", async () => {
  const db = openDatabase(":memory:");
  await db.run("INSERT INTO users (google_sub,email,name) VALUES (?,?,?)", [
    "n",
    "Notice@example.com",
    "N",
  ]);
  const user = await db.get("SELECT id,email FROM users");
  const now = Date.now();
  await db.run(
    "INSERT INTO account_notices (id,user_id,email,kind,separate,created_at) VALUES (?,?,?,?,?,?)",
    ["one", user.id, user.email.toLowerCase(), "excess_login", 0, now],
  );
  await db.run(
    "INSERT INTO account_notices (id,user_id,email,kind,separate,created_at) VALUES (?,?,?,?,?,?)",
    ["two", null, user.email.toLowerCase(), "group_revoked", 1, now - 1],
  );
  const notices = await listNotices(db, user);
  assert.deepEqual(
    notices.map((notice) => notice.id),
    ["one", "two"],
  );
  db.close();
});

test("session touch skips a second write inside ten minutes", async () => {
  const db = openDatabase(":memory:");
  const store = new SqliteSessionStore(db);
  const value = {
    cookie: { expires: new Date(Date.now() + 86400000).toISOString() },
    userId: 1,
  };
  await new Promise((resolve, reject) =>
    store.set("sid", value, (error) => (error ? reject(error) : resolve())),
  );
  let writes = 0;
  const original = db.run.bind(db);
  db.run = (sql, params) => {
    if (String(sql).startsWith("UPDATE sessions")) writes += 1;
    return original(sql, params);
  };
  await new Promise((resolve, reject) =>
    store.touch("sid", value, (error) => (error ? reject(error) : resolve())),
  );
  await new Promise((resolve, reject) =>
    store.touch("sid", value, (error) => (error ? reject(error) : resolve())),
  );
  assert.equal(writes, 0);
  db.close();
});
