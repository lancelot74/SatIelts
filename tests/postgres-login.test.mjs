import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import supertest from "supertest";
import postgres from "postgres";
import signature from "cookie-signature";
import {
  MILLIS_ADVISORY_LOCK,
  MILLIS_MIGRATION_ID,
  openPostgres,
  widenMillis,
} from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
import { priceFor } from "../src/config/pricing.js";
import {
  activateLogin,
  cancelLoginRegistration,
  registerLogin,
  revokeOtherSessions,
  sessionHash,
  touchSession,
} from "../server/sessions.mjs";

const fixtureName = /^studyroom_login_[a-f0-9]{12}$/;

function localParts(value) {
  const url = new URL(value);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:")
    throw new Error("Postgres tests refuse a non-postgres URL");
  if (!["localhost", "127.0.0.1"].includes(url.hostname))
    throw new Error("Postgres tests refuse a non-local database");
  if ([...url.searchParams.keys()].length)
    throw new Error("Postgres tests refuse URL query parameters");
  if (!url.username || !url.password)
    throw new Error("Postgres tests refuse an incomplete login");
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

function optionsFor(parts, database) {
  return {
    host: parts.host,
    port: parts.port,
    user: parts.user,
    password: parts.password,
    database,
    max: 1,
    prepare: false,
    ssl: false,
    connect_timeout: 3,
  };
}

function client(parts, database) {
  return postgres(optionsFor(parts, database));
}

function ownedUrl(parts, database) {
  const url = new URL("postgres://127.0.0.1");
  url.hostname = parts.host;
  url.port = String(parts.port);
  url.username = parts.user;
  url.password = parts.password;
  url.pathname = `/${database}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function identified(parts, database) {
  if (!fixtureName.test(database)) throw new Error(`refusing database ${database}`);
  const sql = client(parts, database);
  try {
    const rows = await sql`select current_database() as name`;
    if (rows[0].name !== database)
      throw new Error(`connected to ${rows[0].name}, not ${database}`);
    return sql;
  } catch (error) {
    await sql.end({ timeout: 1 }).catch(() => {});
    throw error;
  }
}

async function createOwned(admin, parts, created) {
  const name = `studyroom_login_${randomBytes(6).toString("hex")}`;
  if (!fixtureName.test(name)) throw new Error("refusing an unexpected fixture name");
  await admin.unsafe(`create database ${name}`);
  created.push(name);
  const sql = await identified(parts, name);
  return { name, sql };
}

async function dropFixture(parts, name) {
  if (!fixtureName.test(name)) throw new Error(`refusing to drop ${name}`);
  const sql = client(parts, "postgres");
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

test("postgres fixtures refuse a hosted database and query parameters before connecting", () => {
  assert.throws(
    () => localParts("postgres://user:secret@db.example.supabase.co:6543/postgres"),
    /non-local/,
  );
  assert.throws(
    () => localParts("postgres://study:study@127.0.0.1:5432/postgres?database=postgres"),
    /query parameters/,
  );
});

test("postgres login, migration, and session compensation", { timeout: 60000 }, async () => {
  const base = process.env.POSTGRES_TEST_URL || "postgres://study:study@127.0.0.1:5432/postgres";
  const parts = localParts(base);
  const admin = client(parts, "postgres");
  const created = [];
  const open = [];
  const role = `study_boot_${randomBytes(6).toString("hex")}`;
  const rolePassword = randomBytes(8).toString("hex");
  let roleReady = false;
  try {
    await admin`select 1 as ok`;
    const before = await admin`
      select count(*)::int as n from pg_tables
      where schemaname = 'public'
        and tablename in ('users', 'orders', 'entitlements', 'schema_migrations')
    `;
    assert.throws(
      () => localParts(`${ownedUrl(parts, "postgres")}?database=postgres`),
      /query parameters/,
    );
    const after = await admin`
      select count(*)::int as n from pg_tables
      where schemaname = 'public'
        and tablename in ('users', 'orders', 'entitlements', 'schema_migrations')
    `;
    assert.equal(before[0].n, after[0].n);
    if (!/^study_boot_[a-f0-9]{12}$/.test(role)) throw new Error("refusing role name");
    await admin.unsafe(
      `create role ${role} login password '${rolePassword}' nosuperuser nocreatedb nocreaterole`,
    );
    roleReady = true;

    const legacy = await createOwned(admin, parts, created);
    const raw = legacy.sql;
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

    const partial = await createOwned(admin, parts, created);
    const part = partial.sql;
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

    const raced = await createOwned(admin, parts, created);
    const left = raced.sql;
    const right = client(parts, raced.name);
    open.push(left, right);
    await left.unsafe(legacyTables);
    await Promise.all([widenMillis(left), widenMillis(right)]);
    const raceTypes = await left`
      select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'orders' and column_name = 'created_at'
    `;
    assert.equal(raceTypes[0].data_type, "bigint");

    const holder = client(parts, raced.name);
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

    const locked = await createOwned(admin, parts, created);
    open.push(locked.sql);
    await locked.sql.unsafe(legacyTables);
    await locked.sql.unsafe(
      `insert into orders (id,code,user_id,plan,group_size,amount_mnt,list_amount_mnt,status,expires_at,paid_at,created_at)
       values (1,'ES-1000',1,'week',1,3500,7000,'awaiting_payment',1700000100,null,1700000000)`,
    );
    const locker = client(parts, locked.name);
    open.push(locker);
    await locker.unsafe("begin");
    await locker.unsafe("lock table public.orders in access exclusive mode");
    await assert.rejects(
      widenMillis(locked.sql, { lockTimeoutMs: 300, statementTimeoutMs: 1000, retries: 0 }),
      (error) => error.code === "55P03",
    );
    const unchanged = await locker`
      select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'orders' and column_name = 'created_at'
    `;
    assert.equal(unchanged[0].data_type, "integer");
    const keptValue = await locker`select paid_at, created_at from orders where code = 'ES-1000'`;
    assert.equal(keptValue[0].paid_at, null);
    assert.equal(Number(keptValue[0].created_at), 1700000000);
    await locker.unsafe("rollback");
    await widenMillis(locked.sql, { retries: 0 });
    const rewritten = await locked.sql`
      select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'orders' and column_name = 'created_at'
    `;
    assert.equal(rewritten[0].data_type, "bigint");

    const manual = await createOwned(admin, parts, created);
    open.push(manual.sql);
    await manual.sql.unsafe(legacyTables);
    await manual.sql.end({ timeout: 1 });
    await new Promise((resolve, reject) => {
      execFile(
        "psql",
        ["-h", parts.host, "-p", String(parts.port), "-U", parts.user, "-d", manual.name, "-v", "ON_ERROR_STOP=1", "-f", "server/migrations/2026-11-08-millis-bigint.sql"],
        { env: { ...process.env, PGPASSWORD: parts.password } },
        (error, _stdout, stderr) => (error ? reject(new Error(stderr || error.message)) : resolve()),
      );
    });
    await new Promise((resolve, reject) => {
      execFile(
        "psql",
        ["-h", parts.host, "-p", String(parts.port), "-U", parts.user, "-d", manual.name, "-v", "ON_ERROR_STOP=1", "-f", "server/migrations/2026-11-08-millis-bigint.sql"],
        { env: { ...process.env, PGPASSWORD: parts.password } },
        (error, _stdout, stderr) => (error ? reject(new Error(stderr || error.message)) : resolve()),
      );
    });
    const manualClient = await identified(parts, manual.name);
    open.push(manualClient);
    const manualType = await manualClient`
      select count(*)::int as n from information_schema.columns
      where table_schema = 'public'
        and table_name in ('orders', 'entitlements')
        and column_name in ('starts_at','ends_at','created_at','expires_at','paid_at')
        and data_type = 'bigint'
    `;
    assert.equal(manualType[0].n, 6);
    const manualVersion = await manualClient`select count(*)::int as n from public.schema_migrations where id = ${MILLIS_MIGRATION_ID}`;
    assert.equal(manualVersion[0].n, 1);

    const boots = await createOwned(admin, parts, created);
    await boots.sql.end({ timeout: 1 });
    const [bootOne, bootTwo] = await Promise.all([
      openPostgres(ownedUrl(parts, boots.name)),
      openPostgres(ownedUrl(parts, boots.name)),
    ]);
    await bootOne.close();
    await bootTwo.close();
    const bootCheck = await identified(parts, boots.name);
    open.push(bootCheck);
    const bootColumn = await bootCheck`
      select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'orders' and column_name = 'created_at'
    `;
    assert.equal(bootColumn[0].data_type, "bigint");
    assert.equal((await bootCheck`select to_regclass('public.users') as name`)[0].name, "users");

    const fresh = await createOwned(admin, parts, created);
    await fresh.sql.end({ timeout: 1 });
    const db = await openPostgres(ownedUrl(parts, fresh.name));
    const selected = await db.get("select current_database() as name");
    if (selected.name !== fresh.name)
      throw new Error(`openPostgres selected ${selected.name}`);
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

      await assertFixture(db, fresh.name);
      await db.run("delete from user_sessions");
      await db.run("delete from sessions");
      async function seed(sid, at) {
        const expires = Date.now() + 86400000;
        await db.run("insert into sessions (sid,data,expires) values (?,?,?)", [
          sid,
          JSON.stringify({
            cookie: {
              originalMaxAge: 86400000,
              expires: new Date(expires).toISOString(),
              httpOnly: true,
              path: "/",
              sameSite: "lax",
            },
            userId: user.id,
            csrf: `csrf-${sid}`,
          }),
          expires,
        ]);
        await db.run(
          "insert into user_sessions (sid_hash,sid,user_id,created_at,last_seen,label,network) values (?,?,?,?,?,?,?)",
          [sessionHash(sid), sid, user.id, at, at, "Browser on computer", "private or local network"],
        );
      }
      function browserCookie(sidValue) {
        return `studyroom.sid=${encodeURIComponent("s:" + signature.sign(sidValue, config.sessionSecret))}`;
      }
      const loginFields = {
        userId: user.id,
        label: "Browser on computer",
        network: "private or local network",
      };
      await seed("A", 1);
      await seed("B", 2);
      await seed("C", 3);
      let releaseCancel;
      const cancelEntered = new Promise((resolve) => {
        releaseCancel = resolve;
      });
      await registerLogin(db, { ...loginFields, sid: "D", now: 4 });
      await Promise.all([
        (async () => {
          releaseCancel();
          await cancelLoginRegistration(db, "D");
        })(),
        (async () => {
          await cancelEntered;
          await registerLogin(db, { ...loginFields, sid: "E", now: 5 });
          await activateLogin(db, { ...loginFields, sid: "E", now: 5 });
        })(),
      ]);
      const afterOverlap = await db.all(
        "select sid from user_sessions where user_id=? order by created_at",
        [user.id],
      );
      assert.ok(afterOverlap.length <= 3);
      assert.equal(afterOverlap.some((row) => row.sid === "E"), true);
      assert.equal(afterOverlap.some((row) => row.sid === "A"), false);
      assert.equal(afterOverlap.some((row) => row.sid === "D"), false);
      assert.equal(await touchSession(db, "A", user.id, Date.now()), false);
      assert.equal(await touchSession(db, "E", user.id, Date.now()), true);
      assert.equal(
        (await supertest(app).get("/api/session").set("Cookie", browserCookie("A"))).body.user,
        null,
      );

      await assertFixture(db, fresh.name);
      await db.run("delete from user_sessions");
      await db.run("delete from sessions");
      await seed("A", 10);
      await seed("B", 11);
      await seed("C", 12);
      let releaseRevoke;
      const revokeEntered = new Promise((resolve) => {
        releaseRevoke = resolve;
      });
      await registerLogin(db, { ...loginFields, sid: "D", now: 13 });
      await Promise.all([
        (async () => {
          releaseRevoke();
          await revokeOtherSessions(db, { userId: user.id, sid: "B" });
        })(),
        (async () => {
          await revokeEntered;
          await cancelLoginRegistration(db, "D");
        })(),
      ]);
      assert.equal(await touchSession(db, "A", user.id, Date.now()), false);
      assert.equal(await touchSession(db, "B", user.id, Date.now()), true);
      assert.equal(await touchSession(db, "C", user.id, Date.now()), false);
      assert.equal(await touchSession(db, "D", user.id, Date.now()), false);
      assert.ok(
        Number((await db.get("select count(*) as n from user_sessions where user_id=?", [user.id])).n) <= 3,
      );
      assert.equal(
        (await supertest(app).get("/api/session").set("Cookie", browserCookie("A"))).body.user,
        null,
      );

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

    const blockedBoot = await createOwned(admin, parts, created);
    await blockedBoot.sql.unsafe("revoke create on schema public from public");
    await blockedBoot.sql.unsafe(`grant connect on database ${blockedBoot.name} to ${role}`);
    const bootProbe = postgres({
      ...optionsFor(parts, blockedBoot.name),
      user: role,
      password: rolePassword,
    });
    open.push(bootProbe);
    const [bootWho] = await bootProbe`select current_database() as name`;
    assert.equal(bootWho.name, blockedBoot.name);
    await bootProbe.end({ timeout: 1 });
    await assert.rejects(() =>
      openPostgres(ownedUrl({ ...parts, user: role, password: rolePassword }, blockedBoot.name)),
    );
    const backends = await admin`
      select count(*)::int as n from pg_stat_activity
      where usename = ${role} and datname = ${blockedBoot.name}
    `;
    assert.equal(backends[0].n, 0);
  } finally {
    for (const sql of open) await sql.end({ timeout: 1 }).catch(() => {});
    for (const name of created) await dropFixture(parts, name).catch(() => {});
    if (roleReady) await admin.unsafe(`drop role if exists ${role}`).catch(() => {});
    await admin.end({ timeout: 1 }).catch(() => {});
  }
});
