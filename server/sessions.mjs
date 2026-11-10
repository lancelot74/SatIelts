import { createHash, randomUUID } from "node:crypto";

export const SESSION_CAP = 3;
const DAY = 86400000;

export const sessionTables = `
CREATE TABLE IF NOT EXISTS user_sessions (
  sid_hash TEXT PRIMARY KEY,
  sid TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  created_at BIGINT NOT NULL,
  last_seen BIGINT NOT NULL,
  label TEXT NOT NULL,
  network TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS user_sessions_user ON user_sessions (user_id, created_at, sid_hash);
CREATE TABLE IF NOT EXISTS account_notices (
  id TEXT PRIMARY KEY,
  user_id INTEGER,
  email TEXT,
  kind TEXT NOT NULL,
  separate INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS account_notices_user ON account_notices (user_id, created_at);
CREATE INDEX IF NOT EXISTS account_notices_email_lower ON account_notices (lower(email), created_at);
`;

export function sessionHash(sid) {
  return createHash("sha256").update(String(sid)).digest("hex");
}

export function deviceLabel(userAgent) {
  const text = String(userAgent || "");
  const browser = /Edg\//.test(text)
    ? "Edge"
    : /Chrome\//.test(text)
      ? "Chrome"
      : /Firefox\//.test(text)
        ? "Firefox"
        : /Safari\//.test(text)
          ? "Safari"
          : "Browser";
  const device = /iPhone|iPad/.test(text)
    ? "iPhone"
    : /Android/.test(text)
      ? "Android"
      : "computer";
  return `${browser} on ${device}`;
}

// Coarse label only. Not a location, not stored as a raw address, and never a ban.
export function coarseNetwork(ip) {
  const value = String(ip || "");
  if (
    !value ||
    value === "127.0.0.1" ||
    value === "::1" ||
    value.startsWith("10.") ||
    value.startsWith("192.168.") ||
    value.startsWith("172.16.") ||
    value.startsWith("172.17.") ||
    value.startsWith("172.18.") ||
    value.startsWith("172.19.") ||
    value.startsWith("172.2") ||
    value.startsWith("172.30.") ||
    value.startsWith("172.31.") ||
    value.startsWith("::ffff:127.")
  )
    return "private or local network";
  const parts = value.replace(/^::ffff:/, "").split(".");
  if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part)))
    return `approximate network ${parts[0]}.${parts[1]}.x.x`;
  return "approximate network";
}

async function addNotice(tx, { userId, email, kind, separate, now }) {
  const recent = userId
    ? await tx.get(
        "SELECT 1 AS ok FROM account_notices WHERE kind=? AND user_id=? AND created_at>?",
        [kind, userId, now - 6 * 3600000],
      )
    : await tx.get(
        "SELECT 1 AS ok FROM account_notices WHERE kind=? AND lower(email)=lower(?) AND created_at>?",
        [kind, email, now - 6 * 3600000],
      );
  if (recent) return;
  await tx.run(
    "INSERT INTO account_notices (id,user_id,email,kind,separate,created_at) VALUES (?,?,?,?,?,?)",
    [
      randomUUID(),
      userId ?? null,
      email ? String(email).toLowerCase() : null,
      kind,
      separate ? 1 : 0,
      now,
    ],
  );
}

// Insert only. Cap eviction happens after the cookie is stored, and a failed
// save deletes this row alone. Old session credentials are never rewritten.
export async function registerLogin(db, { sid, userId, now, label, network }) {
  const hash = sessionHash(sid);
  return db.transaction(async (tx) => {
    if (db.dialect === "postgres")
      await tx.get("SELECT id FROM users WHERE id=? FOR UPDATE", [userId]);
    await tx.run(
      "INSERT INTO user_sessions (sid_hash,sid,user_id,created_at,last_seen,label,network) VALUES (?,?,?,?,?,?,?)",
      [hash, sid, userId, now, now, label, network],
    );
  });
}

export async function cancelLoginRegistration(db, sid) {
  await db.run("DELETE FROM sessions WHERE sid=?", [sid]);
  await db.run("DELETE FROM user_sessions WHERE sid=?", [sid]);
}

// Drop the oldest other sessions until the cap holds. The saved sid stays.
export async function activateLogin(db, { sid, userId, now, network }) {
  return db.transaction(async (tx) => {
    if (db.dialect === "postgres")
      await tx.get("SELECT id FROM users WHERE id=? FOR UPDATE", [userId]);
    const current = await tx.get(
      "SELECT sid FROM user_sessions WHERE sid=? AND user_id=?",
      [sid, userId],
    );
    if (!current) return { active: 0, dropped: 0 };
    const others = await tx.all(
      "SELECT sid, network FROM user_sessions WHERE user_id=? AND sid<>? ORDER BY created_at ASC, sid_hash ASC",
      [userId, sid],
    );
    let dropped = 0;
    while (others.length + 1 > SESSION_CAP) {
      const oldest = others.shift();
      await tx.run("DELETE FROM sessions WHERE sid=?", [oldest.sid]);
      await tx.run("DELETE FROM user_sessions WHERE sid=?", [oldest.sid]);
      dropped += 1;
    }
    if (dropped)
      await addNotice(tx, {
        userId,
        kind: "excess_login",
        separate: false,
        now,
      });
    if (others.some((row) => row.network && row.network !== network))
      await addNotice(tx, {
        userId,
        kind: "unusual_place",
        separate: false,
        now,
      });
    return { active: others.length + 1, dropped };
  });
}

export async function touchSession(db, sid, userId, now) {
  const hash = sessionHash(sid);
  const row = await db.get(
    "SELECT sid_hash, last_seen FROM user_sessions WHERE sid_hash=? AND user_id=?",
    [hash, userId],
  );
  if (!row) return false;
  if (now - Number(row.last_seen) > 60000)
    await db.run("UPDATE user_sessions SET last_seen=? WHERE sid_hash=?", [
      now,
      hash,
    ]);
  return true;
}

export async function listSessions(db, userId, sid) {
  const current = sessionHash(sid);
  const rows = await db.all(
    "SELECT sid_hash, created_at, last_seen, label, network FROM user_sessions WHERE user_id=? ORDER BY created_at ASC, sid_hash ASC",
    [userId],
  );
  return rows.map((row) => ({
    id: row.sid_hash,
    createdAt: Number(row.created_at),
    lastSeen: Number(row.last_seen),
    label: row.label,
    network: row.network,
    current: row.sid_hash === current,
  }));
}

export async function listNotices(db, user) {
  const rows = await db.all(
    `SELECT id, kind, separate, created_at FROM (
       SELECT id, kind, separate, created_at FROM account_notices WHERE user_id=?
       UNION
       SELECT id, kind, separate, created_at FROM account_notices
       WHERE email IS NOT NULL AND lower(email)=lower(?)
     ) notices
     ORDER BY created_at DESC LIMIT 10`,
    [user.id, user.email],
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    separate: Boolean(row.separate),
    createdAt: Number(row.created_at),
  }));
}

export async function revokeSession(db, { userId, sid, hash }) {
  const row = await db.get(
    "SELECT sid FROM user_sessions WHERE sid_hash=? AND user_id=?",
    [hash, userId],
  );
  if (!row) return { error: "not_found" };
  if (row.sid === sid) return { error: "current_session" };
  await db.run("DELETE FROM sessions WHERE sid=?", [row.sid]);
  await db.run("DELETE FROM user_sessions WHERE sid=?", [row.sid]);
  return { ok: true };
}

export async function revokeOtherSessions(db, { userId, sid }) {
  const rows = await db.all(
    "SELECT sid FROM user_sessions WHERE user_id=? AND sid<>?",
    [userId, sid],
  );
  for (const row of rows) {
    await db.run("DELETE FROM sessions WHERE sid=?", [row.sid]);
    await db.run("DELETE FROM user_sessions WHERE sid=?", [row.sid]);
  }
  return { ok: true, revoked: rows.length };
}

export async function addRevokeNotice(db, { userId, email, separate, now }) {
  await addNotice(db, {
    userId,
    email,
    kind: "group_revoked",
    separate,
    now,
  });
}

export { DAY };
