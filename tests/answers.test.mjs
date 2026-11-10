import test from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { openDatabase } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
import {
  activateLogin,
  cancelLoginRegistration,
  registerLogin,
  sessionHash,
} from "../server/sessions.mjs";
import { DatabaseRateLimitStore } from "../server/rate-limit-store.mjs";
import { retainExpired } from "../server/retention.mjs";

const origin = "http://localhost:5173";
const config = {
  origin,
  sessionSecret: "test-secret-only-at-least-thirty-two-characters",
  googleClientId: "test-client",
  googleClientSecret: "test-secret",
  redirectUri: "http://localhost:5173/api/auth/google/callback",
  ownerGoogleSub: "owner",
};

function fixture(initialNow = 1_700_000_000_000) {
  const db = openDatabase(":memory:");
  let clock = initialNow;
  let pending;
  const oauthClient = {
    generateAuthUrl(opts) {
      pending = opts;
      return `https://accounts.google.com/o/oauth2/v2/auth?state=${opts.state}`;
    },
    async getToken() {
      return { tokens: { id_token: "learner" } };
    },
    async verifyIdToken() {
      return {
        getPayload: () => ({
          sub: "learner",
          email: "learner@example.com",
          name: "learner",
          email_verified: true,
          nonce: pending.nonce,
        }),
      };
    },
  };
  const app = createApp({
    db,
    config,
    oauthClient,
    now: () => clock,
  });
  return {
    db,
    app,
    advance: (ms) => (clock += ms),
    set: (value) => (clock = value),
    agent: () => supertest.agent(app),
  };
}

const post = (agent, url, csrf, body) =>
  agent.post(url).set("x-csrf-token", csrf).set("Origin", origin).send(body ?? {});
const put = (agent, url, csrf, body) =>
  agent.put(url).set("x-csrf-token", csrf).set("Origin", origin).send(body);

async function sessionOf(agent) {
  return (await agent.get("/api/session").expect(200)).body;
}

async function startSample(agent, csrf) {
  return (
    await post(agent, "/api/tests/ielts/sample/start", csrf).expect(200)
  ).body;
}

test("a later revision wins when an older save arrives after it", async () => {
  const f = fixture();
  const agent = f.agent();
  const session = await sessionOf(agent);
  const start = await startSample(agent, session.csrf);
  await put(agent, `/api/runs/${start.runId}/answers`, session.csrf, {
    answers: { 0: 1 },
    revision: 2,
  }).expect(200);
  const stale = await put(agent, `/api/runs/${start.runId}/answers`, session.csrf, {
    answers: { 0: 0 },
    revision: 1,
  }).expect(200);
  assert.equal(stale.body.stale, true);
  const stored = JSON.parse(
    (await f.db.get("SELECT answers FROM runs WHERE id=?", [start.runId])).answers,
  );
  assert.deepEqual(stored, { 0: 1 });
  f.db.close();
});

test("a flush before the deadline is what an expired submit grades", async () => {
  const f = fixture();
  const agent = f.agent();
  const session = await sessionOf(agent);
  const start = await startSample(agent, session.csrf);
  f.set(start.deadline - 1000);
  await put(agent, `/api/runs/${start.runId}/answers`, session.csrf, {
    answers: { 0: 0, 1: 1, 2: 0, 3: 2, 4: 0, 5: "sponges" },
    revision: 1,
  }).expect(200);
  f.set(start.deadline + 1);
  const result = (
    await post(agent, `/api/runs/${start.runId}/submit`, session.csrf, {
      answers: { 0: 1 },
      revision: 2,
    }).expect(200)
  ).body;
  assert.equal(result.expired, true);
  assert.equal(result.score, 6);
  f.db.close();
});

test("a pending login is not counted when the cap evicts browsers", async () => {
  const db = openDatabase(":memory:");
  await db.run(
    "INSERT INTO users (google_sub,email,name) VALUES (?,?,?)",
    ["learner", "learner@example.com", "Learner"],
  );
  const user = await db.get("SELECT id FROM users");
  async function seed(sid, at) {
    await db.run(
      "INSERT INTO user_sessions (sid_hash,sid,user_id,created_at,last_seen,label,network,active) VALUES (?,?,?,?,?,?,?,?)",
      [sessionHash(sid), sid, user.id, at, at, "Browser on computer", "private or local network", 1],
    );
  }
  await seed("A", 1);
  await seed("B", 2);
  await seed("C", 3);
  await registerLogin(db, {
    sid: "D",
    userId: user.id,
    now: 4,
    label: "Browser on computer",
    network: "private or local network",
  });
  await registerLogin(db, {
    sid: "E",
    userId: user.id,
    now: 5,
    label: "Browser on computer",
    network: "private or local network",
  });
  await activateLogin(db, {
    sid: "E",
    userId: user.id,
    now: 5,
    network: "private or local network",
  });
  await cancelLoginRegistration(db, "D");
  const left = await db.all(
    "SELECT sid FROM user_sessions WHERE user_id=? ORDER BY created_at",
    [user.id],
  );
  assert.deepEqual(
    left.map((row) => row.sid),
    ["B", "C", "E"],
  );
  db.close();
});

test("catalog responses have a fixed public shape and no session cookie", async () => {
  const f = fixture();
  const anonymous = await f.agent().get("/api/catalog").expect(200);
  const learner = f.agent();
  await sessionOf(learner);
  const authed = await learner.get("/api/catalog").expect(200);
  assert.deepEqual(authed.body, anonymous.body);
  assert.equal(anonymous.headers["set-cookie"], undefined);
  assert.equal(authed.headers["set-cookie"], undefined);
  const allowed = new Set([
    "id",
    "name",
    "edition",
    "count",
    "guidePages",
    "sampleMinutes",
    "tagline",
    "description",
    "skills",
    "topics",
    "lessons",
    "lessonPages",
    "modes",
    "tests",
    "books",
  ]);
  const summary = new Set([
    "exam",
    "number",
    "set",
    "mode",
    "minutes",
    "count",
    "sections",
    "outline",
    "transcriptPractice",
    "selfReview",
  ]);
  const banned = new Set([
    "answer",
    "accepted",
    "explanation",
    "passage",
    "passageMn",
    "speechText",
    "questions",
    "guide",
  ]);
  function walk(value, keys) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, keys));
      return;
    }
    for (const key of Object.keys(value)) {
      assert.equal(banned.has(key), false, key);
      if (keys) assert.equal(keys.has(key), true, key);
    }
  }
  for (const exam of anonymous.body) {
    walk(exam, allowed);
    for (const mode of exam.modes) {
      walk(mode.sample, summary);
      for (const item of mode.tests) walk(item, summary);
    }
    for (const book of exam.books)
      for (const item of book.tests) walk(item, summary);
  }
  f.db.close();
});

test("shared rate-limit counters survive a second store instance", async () => {
  const db = openDatabase(":memory:");
  const first = new DatabaseRateLimitStore(db);
  const second = new DatabaseRateLimitStore(db);
  first.init({ windowMs: 60000 });
  second.init({ windowMs: 60000 });
  assert.equal((await first.increment("user:1")).totalHits, 1);
  assert.equal((await second.increment("user:1")).totalHits, 2);
  db.close();
});

test("retention deletes a bounded batch of expired anonymous sessions", async () => {
  const db = openDatabase(":memory:");
  const now = Date.now();
  for (let i = 0; i < 3; i += 1) {
    await db.run("INSERT INTO sessions (sid,data,expires) VALUES (?,?,?)", [
      `old-${i}`,
      "{}",
      now - 1000,
    ]);
  }
  await db.run("INSERT INTO sessions (sid,data,expires) VALUES (?,?,?)", [
    "live",
    "{}",
    now + 60_000,
  ]);
  const result = await retainExpired(db, now);
  assert.equal(result.skipped, false);
  const left = await db.all("SELECT sid FROM sessions ORDER BY sid");
  assert.deepEqual(
    left.map((row) => row.sid),
    ["live"],
  );
  db.close();
});
