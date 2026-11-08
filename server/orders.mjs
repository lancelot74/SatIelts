import { payment } from "../src/config/payment.js";
import { priceFor as quote } from "../src/config/pricing.js";
import { addRevokeNotice } from "./sessions.mjs";

const DAY = 86400000;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const paymentTables = `
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  plan TEXT NOT NULL,
  group_size INTEGER NOT NULL,
  friend_emails TEXT NOT NULL DEFAULT '[]',
  amount_mnt INTEGER NOT NULL,
  list_amount_mnt INTEGER NOT NULL,
  sale_applied INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'awaiting_payment',
  expires_at BIGINT NOT NULL,
  paid_at BIGINT,
  note TEXT,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS entitlements (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  email TEXT NOT NULL,
  starts_at BIGINT NOT NULL,
  ends_at BIGINT NOT NULL,
  source TEXT NOT NULL,
  order_id INTEGER,
  created_by INTEGER,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS entitlements_user ON entitlements (user_id, ends_at);
CREATE INDEX IF NOT EXISTS entitlements_email ON entitlements (email);
`;

export function orderCode() {
  return `${payment.order.codePrefix}${1000 + Math.floor(Math.random() * 9000)}`;
}

export async function activeEntitlement(db, user, now) {
  if (!user) return null;
  return db.get(
    `SELECT id, ends_at, source FROM entitlements
     WHERE starts_at<=? AND ends_at>?
       AND (
         user_id=?
         OR (user_id IS NULL AND lower(email)=? AND CAST(created_at AS bigint)>=?)
       )
     ORDER BY ends_at DESC`,
    [now, now, user.id, String(user.email).toLowerCase(), now - 30 * DAY],
  );
}

const INVITE_MS = 30 * DAY;

export async function linkFriendEntitlements(db, user, now = Date.now()) {
  await db.run(
    "UPDATE entitlements SET user_id=? WHERE user_id IS NULL AND lower(email)=? AND CAST(created_at AS bigint)>=?",
    [user.id, String(user.email).toLowerCase(), now - INVITE_MS],
  );
}

export async function expireInvitations(db, now = Date.now()) {
  await db.run(
    "DELETE FROM entitlements WHERE user_id IS NULL AND CAST(created_at AS bigint)<?",
    [now - INVITE_MS],
  );
}

// Leftover grants are not access. This does not insert, widen, or delete rows.
export async function migrateLegacyGrants(db) {
  const row = await db.get("SELECT COUNT(*) AS n FROM grants");
  return { leftoverGrants: Number(row?.n || 0) };
}

export async function grantTimedAccess(db, { userId, days, actorId, now, note }) {
  if (days !== 7 && days !== 30) return { error: "invalid_duration" };
  const user = await db.get("SELECT id,email FROM users WHERE id=?", [userId]);
  if (!user) return { error: "not_found" };
  const current = await db.get(
    "SELECT ends_at FROM entitlements WHERE user_id=? AND ends_at>? ORDER BY ends_at DESC",
    [user.id, now],
  );
  const start = Math.max(now, Number(current?.ends_at || 0));
  const end = start + days * DAY;
  await db.run(
    "INSERT INTO entitlements (user_id,email,starts_at,ends_at,source,created_by,created_at) VALUES (?,?,?,?,?,?,?)",
    [user.id, user.email.toLowerCase(), start, end, "manual", actorId, now],
  );
  await db.run(
    "INSERT INTO audit (actor_id,user_id,exam,action,detail) VALUES (?,?,?,?,?)",
    [
      actorId,
      user.id,
      "all",
      "manual_grant",
      JSON.stringify({ days, note: String(note || "").slice(0, 200) }),
    ],
  );
  return { endsAt: end };
}

export async function revokeOrder(db, { code, actorId, now, note }) {
  const order = await db.get("SELECT * FROM orders WHERE code=?", [code]);
  if (!order || order.status !== "paid") return { error: "invalid_status" };
  const rows = await db.all(
    "SELECT user_id,email FROM entitlements WHERE order_id=?",
    [order.id],
  );
  await db.run("DELETE FROM entitlements WHERE order_id=?", [order.id]);
  const claimed = await db.get(
    "UPDATE orders SET status='revoked' WHERE id=? AND status='paid' RETURNING id",
    [order.id],
  );
  if (!claimed) return { error: "invalid_status" };
  const payer = await db.get("SELECT id,email FROM users WHERE id=?", [order.user_id]);
  const still = await db.get(
    "SELECT 1 AS ok FROM entitlements WHERE user_id=? AND ends_at>?",
    [payer.id, now],
  );
  await addRevokeNotice(db, {
    userId: payer.id,
    separate: Boolean(still),
    now,
  });
  for (const row of rows) {
    if (row.user_id && Number(row.user_id) !== Number(payer.id)) {
      const friendStill = await db.get(
        "SELECT 1 AS ok FROM entitlements WHERE user_id=? AND ends_at>?",
        [row.user_id, now],
      );
      await addRevokeNotice(db, {
        userId: row.user_id,
        separate: Boolean(friendStill),
        now,
      });
    } else if (!row.user_id && row.email) {
      await addRevokeNotice(db, { email: row.email, separate: false, now });
    }
  }
  await db.run(
    "INSERT INTO audit (actor_id,user_id,exam,action,detail) VALUES (?,?,?,?,?)",
    [
      actorId,
      payer.id,
      "all",
      "order_revoked",
      JSON.stringify({
        code: order.code,
        amount: order.amount_mnt,
        note: String(note || "").slice(0, 200),
      }),
    ],
  );
  return { ok: true };
}

function friendsOf(body, payer) {
  const list = Array.isArray(body.friends) ? body.friends : [];
  const emails = list.map((email) => String(email).trim().toLowerCase());
  if (new Set(emails).size !== emails.length) return { error: "duplicate_email" };
  if (emails.includes(String(payer).toLowerCase()))
    return { error: "own_email" };
  if (emails.some((email) => !emailPattern.test(email)))
    return { error: "invalid_email" };
  return { emails };
}

export async function createOrder(db, user, body, now = Date.now()) {
  const priced = quote(body.plan, body.group, now);
  if (!priced) return { error: "invalid_plan" };
  const friends =
    priced.group === 3 ? friendsOf(body, user.email) : { emails: [] };
  if (friends.error) return friends;
  if (priced.group === 3 && friends.emails.length !== 2)
    return { error: "friends_required" };
  await db.run(
    "UPDATE orders SET status='cancelled' WHERE user_id=? AND status='awaiting_payment'",
    [user.id],
  );
  let code = orderCode();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const taken = await db.get("SELECT 1 AS ok FROM orders WHERE code=?", [
      code,
    ]);
    if (!taken) break;
    code = orderCode();
  }
  const expires = now + payment.order.ttlHours * 3600000;
  await db.run(
    `INSERT INTO orders (code,user_id,plan,group_size,friend_emails,amount_mnt,list_amount_mnt,sale_applied,status,expires_at,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      code,
      user.id,
      priced.plan,
      priced.group,
      JSON.stringify(friends.emails),
      priced.amount,
      priced.list,
      priced.sale ? 1 : 0,
      "awaiting_payment",
      expires,
      now,
    ],
  );
  return { order: await db.get("SELECT * FROM orders WHERE code=?", [code]) };
}

export async function activateOrder(db, { code, actorId, now, note, source = "manual" }) {
  const order = await db.get("SELECT * FROM orders WHERE code=?", [code]);
  if (!order) return { error: "not_found" };
  if (order.status === "paid") return { order, alreadyPaid: true };
  if (!["awaiting_payment", "needs_review", "expired"].includes(order.status))
    return { error: "invalid_status" };
  const claimed = await db.get(
    "UPDATE orders SET status='paid', paid_at=?, note=? WHERE id=? AND status=? RETURNING id",
    [now, note || null, order.id, order.status],
  );
  if (!claimed) {
    const current = await db.get("SELECT * FROM orders WHERE id=?", [order.id]);
    if (current?.status === "paid") return { order: current, alreadyPaid: true };
    return { error: "invalid_status" };
  }
  const user = await db.get("SELECT id,email FROM users WHERE id=?", [
    order.user_id,
  ]);
  const current = await db.get(
    "SELECT ends_at FROM entitlements WHERE user_id=? AND ends_at>? ORDER BY ends_at DESC",
    [user.id, now],
  );
  const start = Math.max(now, Number(current?.ends_at || 0));
  const end = start + (order.plan === "week" ? 7 : 30) * DAY;
  const entitlementSource = source === "sms" ? "sms" : "manual";
  await db.run(
    "INSERT INTO entitlements (user_id,email,starts_at,ends_at,source,order_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)",
    [user.id, user.email.toLowerCase(), start, end, entitlementSource, order.id, actorId, now],
  );
  for (const email of JSON.parse(order.friend_emails || "[]")) {
    await db.run(
      "INSERT INTO entitlements (user_id,email,starts_at,ends_at,source,order_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)",
      [null, email, now, end, entitlementSource, order.id, actorId, now],
    );
  }
  await db.run(
    "INSERT INTO audit (actor_id,user_id,exam,action,detail) VALUES (?,?,?,?,?)",
    [
      actorId,
      user.id,
      "all",
      source === "sms" ? "sms_paid" : "manual_paid",
      JSON.stringify({
        code: order.code,
        amount: order.amount_mnt,
        note: String(note || "").slice(0, 200),
        at: now,
      }),
    ],
  );
  return {
    order: await db.get("SELECT * FROM orders WHERE id=?", [order.id]),
    endsAt: end,
  };
}
