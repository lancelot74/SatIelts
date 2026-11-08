import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import session from "express-session";
import postgres from "postgres";
import { paymentTables, migrateLegacyGrants, expireInvitations } from "./orders.mjs";
import { smsTables } from "./sms-ingest.mjs";
import { sessionTables } from "./sessions.mjs";

const sqliteSchema = `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, google_sub TEXT UNIQUE NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS grants (user_id INTEGER REFERENCES users(id), exam TEXT NOT NULL, granted_by INTEGER REFERENCES users(id), created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,exam));
 CREATE TABLE IF NOT EXISTS access_requests (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), exam TEXT NOT NULL, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,exam));
 CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), exam TEXT NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, actor_id INTEGER REFERENCES users(id), user_id INTEGER REFERENCES users(id), exam TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), exam TEXT NOT NULL, test_number TEXT NOT NULL, started_at INTEGER NOT NULL, deadline INTEGER NOT NULL, answers TEXT NOT NULL DEFAULT '{}', result TEXT, finished_at INTEGER);
 CREATE INDEX IF NOT EXISTS runs_lookup ON runs (user_id, exam, test_number);
 CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires);`;

const sessionUpsert = `INSERT INTO sessions (sid,data,expires) VALUES (?,?,?)
 ON CONFLICT(sid) DO UPDATE SET data=excluded.data, expires=excluded.expires`;

export function toPostgres(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export function sqlStatements(sql) {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export function openDatabase(path) {
  const raw = new DatabaseSync(path);
  raw.exec(sqliteSchema);
  const columns = raw.prepare("PRAGMA table_info(access_requests)").all();
  if (!columns.some((column) => column.name === "plan"))
    raw.exec("ALTER TABLE access_requests ADD COLUMN plan TEXT");
  raw.exec(paymentTables);
  raw.exec(smsTables);
  raw.exec(sessionTables);
  const audit = raw.prepare("PRAGMA table_info(audit)").all();
  if (!audit.some((column) => column.name === "detail"))
    raw.exec("ALTER TABLE audit ADD COLUMN detail TEXT");
  raw
    .prepare("DELETE FROM entitlements WHERE user_id IS NULL AND CAST(created_at AS bigint)<?")
    .run(Date.now() - 30 * 86400000);
  return wrapSqlite(raw);
}

function wrapSqlite(raw) {
  let chain = Promise.resolve();
  const enqueue = (fn) => {
    const run = chain.then(fn);
    chain = run.then(
      () => {},
      () => {},
    );
    return run;
  };
  const direct = {
    get(sql, params = []) {
      return Promise.resolve(raw.prepare(sql).get(...params));
    },
    all(sql, params = []) {
      return Promise.resolve(raw.prepare(sql).all(...params));
    },
    run(sql, params = []) {
      raw.prepare(sql).run(...params);
      return Promise.resolve();
    },
  };
  return {
    dialect: "sqlite",
    raw,
    prepare: (sql) => raw.prepare(sql),
    get: (sql, params) => enqueue(() => direct.get(sql, params)),
    all: (sql, params) => enqueue(() => direct.all(sql, params)),
    run: (sql, params) => enqueue(() => direct.run(sql, params)),
    exec(sql) {
      return enqueue(() => {
        raw.exec(sql);
      });
    },
    transaction(fn) {
      return enqueue(async () => {
        raw.exec("BEGIN IMMEDIATE");
        try {
          const result = await fn(direct);
          raw.exec("COMMIT");
          return result;
        } catch (error) {
          raw.exec("ROLLBACK");
          throw error;
        }
      });
    },
    close() {
      raw.close();
    },
  };
}

const millisColumns = {
  entitlements: ["starts_at", "ends_at", "created_at"],
  orders: ["created_at", "expires_at", "paid_at"],
};

// Postgres INTEGER is int4. These columns store Date.now() milliseconds.
// SQLite INTEGER is already 64-bit, so only the Postgres boot path widens them.
export async function widenMillis(sql, table, columns) {
  const allowed = millisColumns[table];
  if (!allowed || columns.some((column) => !allowed.includes(column)))
    throw new Error("Refusing to alter an unknown column");
  const found = await sql`
    select column_name, data_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${table}
      and column_name in ${sql(columns)}
  `;
  const narrow = found
    .filter((row) => row.data_type === "integer")
    .map((row) => row.column_name);
  if (!narrow.length) return;
  await sql.unsafe(
    `ALTER TABLE ${table} ${narrow
      .map((column) => `ALTER COLUMN ${column} TYPE bigint`)
      .join(", ")}`,
  );
}

function queryApi(executor) {
  return {
    async get(sql, params = []) {
      const rows = await executor.unsafe(toPostgres(sql), params);
      return rows[0];
    },
    async all(sql, params = []) {
      const rows = await executor.unsafe(toPostgres(sql), params);
      return [...rows];
    },
    async run(sql, params = []) {
      await executor.unsafe(toPostgres(sql), params);
    },
  };
}

export function postgresSsl(connectionString) {
  if (process.env.DATABASE_SSL === "disable") return false;
  if (/localhost|127\.0\.0\.1/.test(connectionString)) return false;
  return "require";
}

export async function openPostgres(connectionString) {
  const sql = postgres(connectionString, {
    max: 1,
    prepare: false,
    ssl: postgresSsl(connectionString),
    idle_timeout: 20,
    connect_timeout: 30,
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (value) => String(value),
        parse: (value) => Number(value),
      },
    },
  });
  const schema = fs.readFileSync(
    new URL("./schema.postgres.sql", import.meta.url),
    "utf8",
  );
  for (const statement of sqlStatements(schema)) await sql.unsafe(statement);
  await sql.unsafe(
    "ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS plan text",
  );
  const roles = await sql`
    select rolname from pg_roles where rolname in ('anon', 'authenticated')
  `;
  for (const role of roles) {
    if (role.rolname !== "anon" && role.rolname !== "authenticated") continue;
    await sql.unsafe(
      `REVOKE ALL ON TABLE users, grants, access_requests, attempts, sessions, audit, runs FROM ${role.rolname}`,
    );
  }
  const api = {
    dialect: "postgres",
    ...queryApi(sql),
    // set_config(..., true) is LOCAL to this transaction, so it stays on the
    // one pooler server connection and cannot leak into the next checkout.
    // A stuck FOR UPDATE then fails instead of holding the only client forever.
    transaction: (fn) =>
      sql.begin(async (tx) => {
        await tx.unsafe(
          "select set_config('lock_timeout', '2000', true), set_config('statement_timeout', '8000', true)",
        );
        return fn(queryApi(tx));
      }),
    close: () => sql.end({ timeout: 5 }),
  };
  for (const statement of sqlStatements(paymentTables))
    await sql.unsafe(statement);
  await widenMillis(sql, "entitlements", ["starts_at", "ends_at", "created_at"]);
  await widenMillis(sql, "orders", ["created_at", "expires_at", "paid_at"]);
  for (const statement of sqlStatements(smsTables))
    await sql.unsafe(statement);
  for (const statement of sqlStatements(sessionTables))
    await sql.unsafe(statement);
  await sql.unsafe("ALTER TABLE audit ADD COLUMN IF NOT EXISTS detail text");
  const locked = [
    "sms_payment_events",
    "sms_rate_hits",
    "orders",
    "entitlements",
    "user_sessions",
    "account_notices",
  ];
  for (const table of locked)
    await sql.unsafe(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  for (const table of ["orders", "entitlements"]) {
    await sql.unsafe(`CREATE SEQUENCE IF NOT EXISTS ${table}_id_seq`);
    await sql.unsafe(
      `ALTER TABLE ${table} ALTER COLUMN id SET DEFAULT nextval('${table}_id_seq')`,
    );
    await sql.unsafe(
      `ALTER SEQUENCE ${table}_id_seq OWNED BY ${table}.id`,
    );
    await sql.unsafe(
      `SELECT setval('${table}_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM ${table}), 0), 1))`,
    );
  }
  for (const role of roles) {
    if (role.rolname !== "anon" && role.rolname !== "authenticated") continue;
    await sql.unsafe(
      `REVOKE ALL ON TABLE ${locked.join(", ")} FROM ${role.rolname}`,
    );
    await sql.unsafe(
      `REVOKE ALL ON SEQUENCE orders_id_seq, entitlements_id_seq FROM ${role.rolname}`,
    );
  }
  await expireInvitations(api);
  await migrateLegacyGrants(api);
  return api;
}

export class SqliteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
  }
  get(sid, cb) {
    this.db
      .get("SELECT data FROM sessions WHERE sid=? AND expires>?", [
        sid,
        Date.now(),
      ])
      .then((row) => cb(null, row ? JSON.parse(row.data) : null))
      .catch(cb);
  }
  set(sid, value, cb = () => {}) {
    const expires = value.cookie?.expires
      ? new Date(value.cookie.expires).getTime()
      : Date.now() + 86400000;
    const save = () =>
      this.db.run(sessionUpsert, [sid, JSON.stringify(value), expires]);
    const due = Date.now() - (this.cleanedAt || 0) > 600000;
    const work = due
      ? this.db
          .run("DELETE FROM sessions WHERE expires<=?", [Date.now()])
          .then(() => {
            this.cleanedAt = Date.now();
            return save();
          })
      : save();
    work.then(() => cb()).catch(cb);
  }
  destroy(sid, cb = () => {}) {
    this.db
      .run("DELETE FROM sessions WHERE sid=?", [sid])
      .then(() => cb())
      .catch(cb);
  }
  touch(sid, value, cb = () => {}) {
    const expires = value.cookie?.expires
      ? new Date(value.cookie.expires).getTime()
      : Date.now() + 86400000;
    this.db
      .run("UPDATE sessions SET expires=? WHERE sid=?", [expires, sid])
      .then(() => cb())
      .catch(cb);
  }
}

export function prepareRuns(db) {
  if (!db.raw) return;
  db.raw.exec(
    `CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), exam TEXT NOT NULL, test_number TEXT NOT NULL, started_at INTEGER NOT NULL, deadline INTEGER NOT NULL, answers TEXT NOT NULL DEFAULT '{}', result TEXT, finished_at INTEGER);
     CREATE INDEX IF NOT EXISTS runs_lookup ON runs (user_id, exam, test_number);`,
  );
}
