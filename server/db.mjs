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
export const MILLIS_MIGRATION_ID = "2026-11-08-millis-bigint";
// Transaction-scoped advisory lock. Session locks do not survive the pooler.
export const MILLIS_ADVISORY_LOCK = 814763219;

function timeoutMs(name, value, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 60000)
    throw new Error(`invalid ${name}`);
  return String(parsed);
}

async function integerMillis(tx) {
  const left = [];
  for (const [table, columns] of Object.entries(millisColumns)) {
    const found = await tx`
      select column_name, data_type
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${table}
        and column_name in ${tx(columns)}
    `;
    for (const column of columns) {
      const row = found.find((item) => item.column_name === column);
      if (!row || row.data_type !== "bigint") left.push(`public.${table}.${column}`);
    }
  }
  return left;
}

// Existing databases created the payment clocks as int4. Fresh databases
// create them as bigint. Boot still runs this so a missed manual step cannot
// bring back error 22003. One advisory lock, a recheck, and a short timeout
// keep concurrent cold starts from stacking ACCESS EXCLUSIVE rewrites.
export async function widenMillis(sql, options = {}) {
  const lock = timeoutMs("lock_timeout", options.lockTimeoutMs, 2000);
  const statement = timeoutMs("statement_timeout", options.statementTimeoutMs, 8000);
  const retries = Number(options.retries ?? 2);
  let last;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await sql.begin(async (tx) => {
        await tx.unsafe(
          `select set_config('lock_timeout', '${lock}', true), set_config('statement_timeout', '${statement}', true)`,
        );
        await tx.unsafe(`select pg_advisory_xact_lock(${MILLIS_ADVISORY_LOCK})`);
        await tx.unsafe(
          `create table if not exists public.schema_migrations (
             id text primary key,
             applied_at timestamptz not null default now()
           )`,
        );
        await tx.unsafe(
          "alter table public.schema_migrations enable row level security",
        );
        for (const [table, columns] of Object.entries(millisColumns)) {
          const found = await tx`
            select column_name, data_type
            from information_schema.columns
            where table_schema = 'public'
              and table_name = ${table}
              and column_name in ${tx(columns)}
          `;
          const narrow = columns.filter((column) =>
            found.some(
              (row) => row.column_name === column && row.data_type === "integer",
            ),
          );
          if (!narrow.length) continue;
          await tx.unsafe(
            `alter table public.${table} ${narrow
              .map((column) => `alter column ${column} type bigint`)
              .join(", ")}`,
          );
        }
        const left = await integerMillis(tx);
        if (left.length) throw new Error(`millis migration incomplete: ${left.join(", ")}`);
        await tx.unsafe(
          `insert into public.schema_migrations (id) values ('${MILLIS_MIGRATION_ID}') on conflict (id) do nothing`,
        );
        return { ok: true };
      });
    } catch (error) {
      last = error;
      if (attempt === retries || (error.code !== "55P03" && error.code !== "57014"))
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
  throw last;
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
  try {
    return await initializePostgres(sql);
  } catch (error) {
    await sql.end({ timeout: 5 }).catch(() => {});
    throw error;
  }
}

async function initializePostgres(sql) {
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
    transaction: (fn, options = {}) =>
      sql.begin(async (tx) => {
        const lock = timeoutMs("lock_timeout", options.lockTimeoutMs, 2000);
        const statement = timeoutMs(
          "statement_timeout",
          options.statementTimeoutMs,
          8000,
        );
        await tx.unsafe(
          `select set_config('lock_timeout', '${lock}', true), set_config('statement_timeout', '${statement}', true)`,
        );
        return fn(queryApi(tx));
      }),
    close: () => sql.end({ timeout: 5 }),
  };
  for (const statement of sqlStatements(paymentTables))
    await sql.unsafe(statement);
  await widenMillis(sql);
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
    "schema_migrations",
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
