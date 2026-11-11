const CLEANUP_LOCK = 814763220;
const BATCH = 200;
const INVITE_MS = 30 * 86400000;
const PENDING_LOGIN_MS = 15 * 60 * 1000;

export async function retainExpired(db, now = Date.now()) {
  const sessions = `DELETE FROM sessions WHERE sid IN (SELECT sid FROM sessions WHERE expires<=? LIMIT ${BATCH})`;
  const invites =
    "DELETE FROM entitlements WHERE user_id IS NULL AND CAST(created_at AS bigint)<?";
  const pending =
    "DELETE FROM user_sessions WHERE active=0 AND created_at<?";
  if (db.dialect === "postgres") {
    return db.transaction(async (tx) => {
      const lock = await tx.get(
        "SELECT pg_try_advisory_xact_lock(?) AS ok",
        [CLEANUP_LOCK],
      );
      if (!lock || lock.ok === false || lock.ok === 0) return { skipped: true };
      await tx.run(sessions, [now]);
      await tx.run(invites, [now - INVITE_MS]);
      await tx.run(pending, [now - PENDING_LOGIN_MS]);
      await tx.run("DELETE FROM rate_limit_hits WHERE window_start<?", [
        now - 86400000,
      ]);
      return { skipped: false };
    });
  }
  await db.run(sessions, [now]);
  await db.run(invites, [now - INVITE_MS]);
  await db.run(pending, [now - PENDING_LOGIN_MS]);
  try {
    await db.run("DELETE FROM rate_limit_hits WHERE window_start<?", [
      now - 86400000,
    ]);
  } catch {
    // The table is created for the optional shared limiter.
  }
  return { skipped: false };
}

const scheduled = new WeakSet();

export function scheduleRetention(db) {
  if (!db || scheduled.has(db)) return;
  scheduled.add(db);
  const timer = setInterval(() => {
    retainExpired(db).catch(() => {});
  }, 10 * 60 * 1000);
  timer.unref?.();
}
