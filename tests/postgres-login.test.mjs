import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import supertest from "supertest";
import postgres from "postgres";
import {
  MILLIS_ADVISORY_LOCK,
  MILLIS_MIGRATION_ID,
  openPostgres,
  widenMillis,
} from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
import { priceFor } from "../src/config/pricing.js";
import { sessionHash } from "../server/sessions.mjs";

const fixtureName = /^studyroom_login_[a-f0-9]{12}$/;

function localServer(value) {
  const url = new URL(value);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:")
    throw new Error("Postgres tests refuse a non-postgres URL");
  if (!["localhost", "127.0.0.1"].includes(url.hostname))
    throw new Error("Postgres tests refuse a non-local database");
  return url;
}

function fixtureTarget(base) {
  const url = localServer(base);
  const name = `studyroom_login_${randomBytes(6).toString("hex")}`;
  if (!fixtureName.test(name)) throw new Error("refusing an unexpected fixture name");
  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";
  const app = new URL(url);
  app.pathname = `/${name}`;
  return { name, maintenance: maintenance.toString(), app: app.toString() };
}

function client(url) {
  return postgres(url, { max: 1, prepare: false, ssl: false, connect_timeout: 3 });
}

async function dropFixture(maintenance, name) {
  if (!fixtureName.test(name)) throw new Error(`refusing to drop ${name}`);
  const sql = client(maintenance);
  try {
    const found = await sql`select datname from pg_database where datname = ${name}`;
    if (!found.length) return;
    await sql.unsafe(
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${name}' and pid <> pg_backend_pid()`,
    );
    await sql.unsafe(`drop database ${name}`);
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function assertFixture(db, name) {
  const current = await db.get("select current_database() as name");
  if (current.name !== name || !fixtureName.test(current.name))
    throw new Error(`refusing to modify database ${current.name}`);
}

const legacyTables = `
create table orders (
  id integer primary key,
  code text unique not null,
  user_id integer not null,
  plan text not null,
  group_size integer not null,
  friend_emails text not null default '[]',
  amount_mnt integer not null,
  list_amount_mnt integer not null,
  sale_applied integer not null default 0,
  status text not null default 'awaiting_payment',
  expires_at integer not null,
  paid_at integer,
  note text,
  created_at integer not null
);
create table entitlements (
  id integer primary key,
  user_id integer,
  email text not null,
  starts_at integer not null,
  ends_at integer not null,
  source text not null,
  order_id integer,
  created_by integer,
  created_at integer not null
);`;

test("postgres fixtures refuse a hosted database before connecting", () => {
  assert.throws(
    () => fixtureTarget("postgres://user:secret@db.example.supabase.co:6543/postgres"),
    /non-local/,
  );
});

test("postgres login, migration, and session compensation", { timeout: 60000 }, async () => {
  const base = process.env.POSTGRES_TEST_URL || "postgres://study:study@127.0.0.1:5432/postgres";
  const maintenanceUrl = new URL(localServer(base));
  maintenanceUrl.pathname = "/postgres";
  const admin = client(maintenanceUrl.toString());
  const created = [];
  const open = [];
  try {
    await admin`select 1 as ok`;
    await admin.unsafe(`
      do $$ begin
        create role study_boot login password 'study_boot' nosuperuser nocreatedb nocreaterole;
      exception when duplicate_object then null;
      end $$;
    `);

    const legacy = fixtureTarget(base);
    created.push(legacy.name);
    await admin.unsafe(`create database ${legacy.name}`);
    const raw = client(legacy.app);
    open.push(raw);
    await raw.unsafe(legacyTables);
    await raw.unsafe(
      `insert into orders (id,code,user_id,plan,group_size,amount_mnt,list_amount_mnt,status,expires_at,paid_at,created_at)
       values (1,'ES-1000',1,'week',1,3500,7000,'awaiting_payment',1700000100,null,1700000000)`,
    );
    await raw.unsafe(
      `insert into entitlements (id,email,starts_at,ends_at,source,created_at)
       values (1,'a@example.com',1700000000,1700001000,'manual',1700000000)`,
    );
    await widenMillis(raw);
    const kept = await raw`select paid_at, created_at from orders where code = 'ES-1000'`;
    assert.equal(kept[0].paid_at, null);
    assert.equal(Number(kept[0].created_at), 1700000000);
    const stamp = Date.now();
    await raw.unsafe(
      `insert into entitlements (id,email,starts_at,ends_at,source,created_at) values (2,'b@example.com',${stamp},${stamp + 1000},'manual',${stamp})`,
    );
    await widenMillis(raw);
    const versions = await raw`select count(*)::int as n from public.schema_migrations where id = ${MILLIS_MIGRATION_ID}`;
    assert.equal(versions[0].n, 1);

    const partial = fixtureTarget(base);
    created.push(partial.name);
    await admin.unsafe(`create database ${partial.name}`);
    const part = client(partial.app);
    open.push(part);
    await part.unsafe(legacyTables);
    await part.unsafe(
      "alter table public.entitlements alter column starts_at type bigint, alter column ends_at type bigint, alter column created_at type bigint",
    );
    await widenMillis(part);
    const types = await part`
      select table_name, column_name, data_type
      from information_schema.columns
      where table_schema = 'public'
        and column_name in ('starts_at','ends_at','created_at','expires_at','paid_at')
        and table_name in ('orders','entitlements')
    `;
    assert.ok(types.length >= 6);
    assert.ok(types.every((column) => column.data_type === "bigint"));

    const raced = fixtureTarget(base);
    created.push(raced.name);
    await admin.unsafe(`create database ${raced.name}`);
    const left = client(raced.app);
    const right = client(raced.app);
    open.push(left, right);
    await left.unsafe(legacyTables);
    await Promise.all([widenMillis(left), widenMillis(right)]);
    const raceTypes = await left`
      select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'orders' and column_name = 'created_at'
    `;
    assert.equal(raceTypes[0].data_type, "bigint");

    const holder = client(raced.app);
    open.push(holder);
    await holder.unsafe("begin");
    await holder.unsafe(`select pg_advisory_xact_lock(${MILLIS_ADVISORY_LOCK})`);
    const blocked = Date.now();
    await assert.rejects(
      widenMillis(left, { lockTimeoutMs: 200, statementTimeoutMs: 1000, retries: 0 }),
      (error) => error.code === "55P03",
    );
    assert.ok(Date.now() - blocked < 1500);
    const retry = widenMillis(left, {
      lockTimeoutMs: 200,
      statementTimeoutMs: 1000,
      retries: 4,
    });
    setTimeout(() => holder.unsafe("rollback").catch(() => {}), 250);
    await retry;

    const fresh = fixtureTarget(base);
    created.push(fresh.name);
    await admin.unsafe(`create database ${fresh.name}`);
    const db = await openPostgres(fresh.app);
    try {
      await assertFixture(db, fresh.name);
      await assert.rejects(
        db.transaction((tx) => tx.run("select pg_sleep(2)"), {
          statementTimeoutMs: 200,
          lockTimeoutMs: 200,
        }),
        (error) => error.code === "57014",
      );
      const timeout = await db.get("show statement_timeout");
      assert.match(String(timeout.statement_timeout), /^0/);
      assert.equal(Number((await db.get("select 1 as ok")).ok), 1);

      const challenges = new Map();
      const oauthClient = {
        generateAuthUrl(opts) {
          challenges.set(opts.code_challenge, opts);
          return `https://accounts.google.com/o/oauth2/v2/auth?state=${opts.state}`;
        },
        async getToken({ code, codeVerifier }) {
          const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
          const opts = challenges.get(challenge);
          assert.ok(opts);
          return { tokens: { id_token: JSON.stringify({ code, nonce: opts.nonce }) } };
        },
        async verifyIdToken({ idToken }) {
          const parsed = JSON.parse(idToken);
          return {
            getPayload: () => ({
              sub: parsed.code,
              email: `${parsed.code}@example.com`,
              name: parsed.code,
              email_verified: true,
              nonce: parsed.nonce,
            }),
          };
        },
      };
      const config = {
        origin: "http://localhost:5173",
        sessionSecret: "test-secret-only-at-least-thirty-two-characters",
        googleClientId: "test-client",
        googleClientSecret: "test-secret",
        redirectUri: "http://localhost:5173/api/auth/google/callback",
        ownerGoogleSub: "owner",
      };
      const app = createApp({ db, config, oauthClient, now: () => Date.now() });
      const post = (agent, url, csrf, body) =>
        agent.post(url).set("x-csrf-token", csrf).set("Origin", config.origin).send(body ?? {});
      function sid(header) {
        return String([].concat(header || []).join(";")).match(/studyroom\.sid=([^;]+)/)?.[1];
      }
      async function login(agent, name, headers = {}) {
        const begin = await agent.get("/api/auth/google").set(headers).expect(302);
        const state = new URL(begin.headers.location).searchParams.get("state");
        const before = sid(begin.headers["set-cookie"]);
        await agent
          .get(`/api/auth/google/callback?state=wrong&code=${name}`)
          .set(headers)
          .expect(302);
        const again = await agent.get("/api/auth/google").set(headers).expect(302);
        const nextState = new URL(again.headers.location).searchParams.get("state");
        const callback = await agent
          .get(`/api/auth/google/callback?state=${nextState}&code=${name}`)
          .set(headers)
          .expect(302);
        assert.equal(callback.headers.location, "/account");
        const after = sid(callback.headers["set-cookie"]);
        assert.ok(after);
        assert.notEqual(after, before);
        return {
          session: (await agent.get("/api/session").set(headers).expect(200)).body,
          cookie: String([].concat(callback.headers["set-cookie"]).join(";")),
        };
      }

      const learner = supertest.agent(app);
      const first = await login(learner, "learner");
      assert.equal(first.session.user.email, "learner@example.com");
      assert.equal(first.session.user.isAdmin, false);
      await learner.post("/api/orders").send({ plan: "week", group: 1, amount: 1 }).expect(403);
      const order = (
        await post(learner, "/api/orders", first.session.csrf, {
          plan: "week",
          group: 1,
          amount: 1,
        }).expect(200)
      ).body;
      assert.equal(order.amount, priceFor("week", 1).amount);

      const user = await db.get("select id from users where email=?", ["learner@example.com"]);
      await assertFixture(db, fresh.name);
      await db.run("delete from user_sessions");
      await db.run("delete from sessions");
      const seeds = ["seed-a", "seed-b", "seed-c"];
      for (let index = 0; index < seeds.length; index += 1) {
        await db.run("insert into sessions (sid,data,expires) values (?,?,?)", [
          seeds[index],
          "{}",
          Date.now() + 86400000,
        ]);
        await db.run(
          "insert into user_sessions (sid_hash,sid,user_id,created_at,last_seen,label,network) values (?,?,?,?,?,?,?)",
          [sessionHash(seeds[index]), seeds[index], user.id, 1000 + index, 1000 + index, "Browser on computer", "private or local network"],
        );
      }
      const original = db.run.bind(db);
      db.run = (sql, params) => {
        if (
          String(sql).startsWith("INSERT INTO sessions") &&
          String(params?.[1] || "").includes("userId")
        )
          return Promise.reject(Object.assign(new Error("save failed"), { code: "SAVE" }));
        return original(sql, params);
      };
      const restart = await learner.get("/api/auth/google").expect(302);
      const failedState = new URL(restart.headers.location).searchParams.get("state");
      const failedCallback = await learner.get(
        `/api/auth/google/callback?state=${failedState}&code=learner`,
      );
      assert.equal(failedCallback.headers.location, "/login?error=sign_in_failed");
      assert.match(String([].concat(failedCallback.headers["set-cookie"]).join(";")), /studyroom\.sid=/);
      await assertFixture(db, fresh.name);
      const remaining = await db.all("select sid from user_sessions order by sid");
      assert.deepEqual(remaining.map((row) => row.sid), seeds);
      db.run = original;
      assert.equal((await learner.get("/api/session")).body.user, null);

      const originalTransaction = db.transaction.bind(db);
      db.transaction = (fn, options) =>
        originalTransaction(async (tx) => {
          const run = tx.run.bind(tx);
          tx.run = (sql, params) => {
            if (String(sql).includes("INSERT INTO user_sessions"))
              return Promise.reject(Object.assign(new Error("register failed"), { code: "REG" }));
            return run(sql, params);
          };
          return fn(tx);
        }, options);
      const again = await learner.get("/api/auth/google").expect(302);
      const registerState = new URL(again.headers.location).searchParams.get("state");
      const registerFail = await learner.get(
        `/api/auth/google/callback?state=${registerState}&code=learner`,
      );
      assert.equal(registerFail.headers.location, "/login?error=sign_in_failed");
      assert.equal(Number((await db.get("select count(*) as n from user_sessions")).n), 3);
      db.transaction = originalTransaction;
      db.run = (sql, params) => {
        if (String(sql).startsWith("DELETE FROM sessions"))
          return Promise.reject(Object.assign(new Error("rotate failed"), { code: "ROT" }));
        return original(sql, params);
      };
      const rotate = await learner.get("/api/auth/google").expect(302);
      const rotateState = new URL(rotate.headers.location).searchParams.get("state");
      const rotateFail = await learner.get(
        `/api/auth/google/callback?state=${rotateState}&code=learner`,
      );
      assert.equal(rotateFail.headers.location, "/login?error=sign_in_failed");
      assert.equal(Number((await db.get("select count(*) as n from user_sessions")).n), 3);
      db.run = original;

      await assertFixture(db, fresh.name);
      await db.run("delete from user_sessions");
      await db.run("delete from sessions");
      const agents = [0, 1, 2, 3].map(() => supertest.agent(app));
      await Promise.all(agents.map((agent) => login(agent, "learner")));
      assert.equal(Number((await db.get("select count(*) as n from user_sessions")).n), 3);
      const alive = await Promise.all(agents.map((agent) => agent.get("/api/session")));
      assert.equal(alive.filter((response) => response.body.user).length, 3);

      const secureApp = createApp({
        db,
        config: { ...config, production: true, trustProxy: true, origin: "https://eightsteppe.org" },
        oauthClient,
        now: () => Date.now(),
      });
      const start = await supertest(secureApp)
        .get("/api/auth/google")
        .set("x-forwarded-proto", "https")
        .expect(302);
      const startCookie = [].concat(start.headers["set-cookie"]).join(";");
      assert.match(startCookie, /HttpOnly/i);
      assert.match(startCookie, /Secure/i);
      assert.match(startCookie, /SameSite=Lax/i);
      const state = new URL(start.headers.location).searchParams.get("state");
      const sent = [].concat(start.headers["set-cookie"]).map((item) => item.split(";")[0]).join("; ");
      const callback = await supertest(secureApp)
        .get(`/api/auth/google/callback?state=${state}&code=secure-learner`)
        .set("x-forwarded-proto", "https")
        .set("Cookie", sent)
        .expect(302);
      assert.equal(callback.headers.location, "/account");
      const signed = [].concat(callback.headers["set-cookie"]).join(";");
      assert.match(signed, /HttpOnly/i);
      assert.match(signed, /Secure/i);
      assert.match(signed, /SameSite=Lax/i);
      assert.notEqual(sid(start.headers["set-cookie"]), sid(callback.headers["set-cookie"]));
      const owner = await login(supertest.agent(app), "owner");
      assert.equal(owner.session.user.isAdmin, true);
    } finally {
      await db.close();
    }

    const blockedBoot = fixtureTarget(base);
    created.push(blockedBoot.name);
    await admin.unsafe(`create database ${blockedBoot.name}`);
    const owner = client(blockedBoot.app);
    open.push(owner);
    await owner.unsafe("revoke create on schema public from public");
    await owner.unsafe(`grant connect on database ${blockedBoot.name} to study_boot`);
    const bootUrl = new URL(blockedBoot.app);
    bootUrl.username = "study_boot";
    bootUrl.password = "study_boot";
    await assert.rejects(() => openPostgres(bootUrl.toString()));
    const backends = await admin`
      select count(*)::int as n from pg_stat_activity
      where usename = 'study_boot' and datname = ${blockedBoot.name}
    `;
    assert.equal(backends[0].n, 0);
  } finally {
    for (const sql of open) await sql.end({ timeout: 1 }).catch(() => {});
    await admin.end({ timeout: 1 }).catch(() => {});
    for (const name of created) await dropFixture(maintenanceUrl.toString(), name).catch(() => {});
  }
});
