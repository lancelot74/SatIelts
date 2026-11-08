import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import supertest from "supertest";
import postgres from "postgres";
import { openPostgres, widenMillis } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
import { priceFor } from "../src/config/pricing.js";
import { request } from "../src/request.js";

const adminUrl =
  process.env.POSTGRES_TEST_ADMIN_URL ||
  "postgres://study:study@127.0.0.1:5432/postgres";
const database = "studyroom_login";
const databaseUrl =
  process.env.POSTGRES_TEST_URL ||
  `postgres://study:study@127.0.0.1:5432/${database}`;

async function canConnect() {
  const sql = postgres(adminUrl, {
    max: 1,
    prepare: false,
    ssl: false,
    connect_timeout: 3,
  });
  try {
    await sql`select 1 as ok`;
    return sql;
  } catch {
    await sql.end({ timeout: 1 }).catch(() => {});
    return null;
  }
}

test("a hung response becomes an error instead of an endless loading state", async () => {
  const server = http.createServer(() => {});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const started = Date.now();
  try {
    await assert.rejects(
      request(`http://127.0.0.1:${port}/api/session`, { timeoutMs: 200 }),
      (error) => error.name === "TimeoutError",
    );
    assert.ok(Date.now() - started < 1000);
  } finally {
    server.close();
  }
});

test("postgres login survives millisecond timestamps, lock timeout, and the session cap", async (t) => {
  const admin = await canConnect();
  if (!admin) {
    t.skip("local Postgres is not available");
    return;
  }
  const existing =
    await admin`select 1 from pg_database where datname = ${database}`;
  if (existing.length) {
    await admin.unsafe(
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${database}' and pid <> pg_backend_pid()`,
    );
    await admin.unsafe(`drop database if exists ${database}`);
  }
  await admin.unsafe(`create database ${database}`);
  await admin.end({ timeout: 1 });

  const db = await openPostgres(databaseUrl);
  const raw = postgres(databaseUrl, { max: 1, prepare: false, ssl: false });
  try {
    const columns = await db.all(
      `select table_name, column_name, data_type
       from information_schema.columns
       where table_schema = 'public'
         and (
           (table_name = 'entitlements' and column_name in ('starts_at', 'ends_at', 'created_at'))
           or (table_name = 'orders' and column_name in ('created_at', 'expires_at', 'paid_at'))
         )
       order by table_name, column_name`,
    );
    assert.equal(columns.length, 6);
    assert.ok(columns.every((column) => column.data_type === "bigint"));
    await widenMillis(raw, "entitlements", [
      "starts_at",
      "ends_at",
      "created_at",
    ]);
    await widenMillis(raw, "orders", ["created_at", "expires_at", "paid_at"]);

    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.run(
          "INSERT INTO account_notices (id,kind,separate,created_at) VALUES (?,?,?,?)",
          ["rolled-back", "excess_login", 0, Date.now()],
        );
        throw new Error("boom");
      }),
      /boom/,
    );
    assert.equal(
      Number((await db.get("SELECT COUNT(*) AS n FROM account_notices")).n),
      0,
    );

    let pending;
    const oauthClient = {
      generateAuthUrl(opts) {
        pending = opts;
        return `https://accounts.google.com/o/oauth2/v2/auth?state=${opts.state}`;
      },
      async getToken({ code, codeVerifier }) {
        assert.ok(codeVerifier);
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
        origin: "http://localhost:5173",
        sessionSecret: "test-secret-only-at-least-thirty-two-characters",
        googleClientId: "test-client",
        googleClientSecret: "test-secret",
        redirectUri: "http://localhost:5173/api/auth/google/callback",
        ownerGoogleSub: "owner",
      },
      oauthClient,
      now: () => Date.now(),
    });
    const post = (agent, url, csrf, body) =>
      agent
        .post(url)
        .set("x-csrf-token", csrf)
        .set("Origin", "http://localhost:5173")
        .send(body ?? {});
    async function login(agent, name) {
      const begin = await agent.get("/api/auth/google").expect(302);
      const state = new URL(begin.headers.location).searchParams.get("state");
      const bad = await agent.get(
        `/api/auth/google/callback?state=wrong&code=${name}`,
      );
      assert.equal(bad.headers.location, "/login?error=sign_in_failed");
      const again = await agent.get("/api/auth/google").expect(302);
      const nextState = new URL(again.headers.location).searchParams.get(
        "state",
      );
      const callback = await agent
        .get(`/api/auth/google/callback?state=${nextState}&code=${name}`)
        .expect(302);
      assert.equal(callback.headers.location, "/account");
      assert.match(String(callback.headers["set-cookie"]), /studyroom\.sid=/);
      return (await agent.get("/api/session").expect(200)).body;
    }

    const stranger = supertest.agent(app);
    const strangerSession = await login(stranger, "learner");
    assert.equal(strangerSession.user.email, "learner@example.com");
    assert.equal(strangerSession.user.isAdmin, false);
    assert.equal(strangerSession.sessions.length, 1);
    await stranger
      .post("/api/access-requests")
      .send({ exam: "ielts" })
      .expect(403);

    const order = (
      await post(stranger, "/api/orders", strangerSession.csrf, {
        plan: "week",
        group: 1,
        amount: 1,
      }).expect(200)
    ).body;
    assert.equal(order.amount, priceFor("week", 1).amount);

    const user = await db.get("SELECT id FROM users WHERE email=?", [
      "learner@example.com",
    ]);
    const holder = postgres(databaseUrl, {
      max: 1,
      prepare: false,
      ssl: false,
    });
    try {
      await holder.unsafe("begin");
      await holder.unsafe("select id from users where id = $1 for update", [
        user.id,
      ]);
      const started = Date.now();
      await assert.rejects(
        db.transaction((tx) =>
          tx.get("SELECT id FROM users WHERE id=? FOR UPDATE", [user.id]),
        ),
        (error) => error.code === "55P03",
      );
      assert.ok(Date.now() - started < 5000);
      assert.equal(Number((await db.get("SELECT 1 AS ok")).ok), 1);
    } finally {
      await holder.unsafe("rollback").catch(() => {});
      await holder.end({ timeout: 1 });
    }

    const retry = await login(stranger, "learner");
    assert.equal(retry.user.email, "learner@example.com");
    await db.run("DELETE FROM user_sessions");
    await db.run("DELETE FROM sessions");

    const agents = [
      supertest.agent(app),
      supertest.agent(app),
      supertest.agent(app),
      supertest.agent(app),
    ];
    const sessions = [];
    for (const agent of agents) sessions.push(await login(agent, "learner"));
    assert.equal(
      Number((await db.get("SELECT COUNT(*) AS n FROM user_sessions")).n),
      3,
    );
    assert.equal((await agents[0].get("/api/session")).body.user, null);
    assert.equal(sessions[3].user.email, "learner@example.com");
    assert.equal(sessions[3].user.isAdmin, false);
    const owner = supertest.agent(app);
    const ownerSession = await login(owner, "owner");
    assert.equal(ownerSession.user.isAdmin, true);
    await post(owner, "/api/admin/access", ownerSession.csrf, {
      userId: sessions[3].user.id,
      action: "approve",
      days: 7,
      note: "Verified transfer",
    }).expect(200);
    await agents[3].get("/api/tests/ielts/1").expect(200);
    await agents[0].get("/api/tests/ielts/1").expect(401);
  } finally {
    await raw.end({ timeout: 1 });
    await db.close();
    const cleanup = postgres(adminUrl, { max: 1, prepare: false, ssl: false });
    await cleanup.unsafe(
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${database}' and pid <> pg_backend_pid()`,
    );
    await cleanup.unsafe(`drop database if exists ${database}`);
    await cleanup.end({ timeout: 1 });
  }
});
