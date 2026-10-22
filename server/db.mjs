import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import session from "express-session";
import postgres from "postgres";

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
    transaction: (fn) => sql.begin(async (tx) => fn(queryApi(tx))),
    close: () => sql.end({ timeout: 5 }),
  };
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
