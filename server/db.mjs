import { DatabaseSync } from "node:sqlite";
import session from "express-session";
export function openDatabase(path) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, google_sub TEXT UNIQUE NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS grants (user_id INTEGER REFERENCES users(id), exam TEXT NOT NULL, granted_by INTEGER REFERENCES users(id), created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,exam));
 CREATE TABLE IF NOT EXISTS access_requests (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), exam TEXT NOT NULL, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,exam));
 CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), exam TEXT NOT NULL, score INTEGER NOT NULL, total INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, actor_id INTEGER REFERENCES users(id), user_id INTEGER REFERENCES users(id), exam TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
  return db;
}
export class SqliteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
  }
  get(sid, cb) {
    try {
      const row = this.db
        .prepare("SELECT data FROM sessions WHERE sid=? AND expires>?")
        .get(sid, Date.now());
      cb(null, row ? JSON.parse(row.data) : null);
    } catch (e) {
      cb(e);
    }
  }
  set(sid, value, cb = () => {}) {
    try {
      this.db.prepare("DELETE FROM sessions WHERE expires<=?").run(Date.now());
      this.db
        .prepare(
          "INSERT OR REPLACE INTO sessions (sid,data,expires) VALUES (?,?,?)",
        )
        .run(
          sid,
          JSON.stringify(value),
          value.cookie.expires
            ? new Date(value.cookie.expires).getTime()
            : Date.now() + 86400000,
        );
      cb();
    } catch (e) {
      cb(e);
    }
  }
  destroy(sid, cb = () => {}) {
    try {
      this.db.prepare("DELETE FROM sessions WHERE sid=?").run(sid);
      cb();
    } catch (e) {
      cb(e);
    }
  }
  touch(sid, value, cb = () => {}) {
    this.set(sid, value, cb);
  }
}
export function prepareRuns(db) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id), exam TEXT NOT NULL, test_number TEXT NOT NULL, started_at INTEGER NOT NULL, deadline INTEGER NOT NULL, answers TEXT NOT NULL DEFAULT '{}', result TEXT, finished_at INTEGER);`,
  );
}
