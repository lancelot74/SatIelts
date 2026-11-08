import { createHash, randomUUID } from "node:crypto";
import { activateOrder } from "./orders.mjs";
import {
  SMS_TEXT_MAX,
  parseKhanSms,
  phoneReceivedAt,
} from "./sms.mjs";

// Trust boundary: Khan Bank does not sign these messages. The webhook token,
// an exact unpaid-order match, and this queue are the controls. Do not grant
// access from ULDEGDEL or from a note that does not match an unpaid order.
// Dedupe is the SHA-256 of the exact submitted text, not amount plus balance.

export const SMS_RATE_LIMIT = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;

export const smsTables = `
CREATE TABLE IF NOT EXISTS sms_payment_events (
  id TEXT PRIMARY KEY,
  sms_hash TEXT NOT NULL UNIQUE,
  account_masked TEXT,
  amount_mnt INTEGER,
  utga TEXT,
  order_code TEXT,
  phone_received_at TEXT,
  server_received_at BIGINT NOT NULL,
  status TEXT NOT NULL,
  unmatched_reason TEXT,
  review_note TEXT,
  order_id INTEGER,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sms_events_status ON sms_payment_events (status, created_at);
CREATE INDEX IF NOT EXISTS sms_events_code ON sms_payment_events (order_code);
CREATE TABLE IF NOT EXISTS sms_rate_hits (
  id TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sms_rate_hits_ip ON sms_rate_hits (ip, created_at);
`;

function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

export async function noteSmsHit(db, ip, now) {
  const key = String(ip || "unknown").slice(0, 64);
  return db.transaction(async (tx) => {
    await tx.run("DELETE FROM sms_rate_hits WHERE created_at<?", [
      now - RATE_WINDOW_MS,
    ]);
    const row = await tx.get(
      "SELECT COUNT(*) AS n FROM sms_rate_hits WHERE ip=? AND created_at>=?",
      [key, now - RATE_WINDOW_MS],
    );
    if (Number(row?.n || 0) >= SMS_RATE_LIMIT) return false;
    await tx.run(
      "INSERT INTO sms_rate_hits (id,ip,created_at) VALUES (?,?,?)",
      [randomUUID(), key, now],
    );
    return true;
  });
}

function rejected(reason, parsed = {}) {
  return {
    status: "rejected",
    reason,
    account: parsed.accountLast4 ? `*****${parsed.accountLast4}` : null,
    amount: null,
    utga: null,
    code: null,
    orderId: null,
  };
}

async function matchOrder(db, tx, parsed, now) {
  if (parsed.parseStatus === "needs_review")
    return {
      status: "unmatched",
      reason: "fractional_amount",
      account: parsed.accountLast4 ? `*****${parsed.accountLast4}` : null,
      amount: null,
      utga: (parsed.note || "").slice(0, 180),
      code: parsed.code,
      orderId: null,
    };
  if (parsed.parseStatus !== "parsed")
    return rejected(parsed.parseStatus || "unparsed", parsed);
  const account = `*****${parsed.accountLast4}`;
  const utga = parsed.note.slice(0, 180);
  const base = {
    account,
    amount: parsed.amount,
    utga,
    code: parsed.code,
    orderId: null,
  };
  if (!parsed.code)
    return { status: "unmatched", reason: "no_code", ...base };
  if (db.dialect === "postgres")
    await tx.get("SELECT id FROM orders WHERE code=? FOR UPDATE", [parsed.code]);
  const order = await tx.get("SELECT * FROM orders WHERE code=?", [parsed.code]);
  if (!order) return { status: "unmatched", reason: "unknown_order", ...base };
  if (Number(order.amount_mnt) !== parsed.amount)
    return { status: "unmatched", reason: "amount_mismatch", ...base };
  if (order.status === "paid")
    return { status: "unmatched", reason: "already_paid", ...base, orderId: order.id };
  if (
    order.status === "expired" ||
    order.status === "revoked" ||
    Number(order.expires_at) <= now
  )
    return {
      status: "unmatched",
      reason: order.status === "revoked" ? "revoked" : "expired",
      ...base,
      orderId: order.id,
    };
  if (!["awaiting_payment", "needs_review"].includes(order.status))
    return { status: "unmatched", reason: "invalid_status", ...base, orderId: order.id };
  const activated = await activateOrder(tx, {
    code: order.code,
    actorId: null,
    now,
    note: "sms",
    source: "sms",
  });
  if (activated.alreadyPaid)
    return { status: "unmatched", reason: "already_paid", ...base, orderId: order.id };
  if (activated.error)
    return { status: "unmatched", reason: activated.error, ...base, orderId: order.id };
  return {
    status: "activated",
    reason: null,
    ...base,
    code: order.code,
    orderId: activated.order.id,
  };
}

export async function ingestSms(db, { text, receivedAt, now }) {
  if (typeof text !== "string" || text.length > SMS_TEXT_MAX || text.trim() === "")
    return { statusCode: 400, body: { ok: false, error: "invalid_body" } };
  const hash = hashText(text);
  const phone = phoneReceivedAt(receivedAt);
  const parsed = parseKhanSms(text);
  const id = randomUUID();
  return db.transaction(async (tx) => {
    const inserted = await tx.get(
      `INSERT INTO sms_payment_events
        (id,sms_hash,account_masked,amount_mnt,utga,order_code,phone_received_at,server_received_at,status,unmatched_reason,order_id,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(sms_hash) DO NOTHING
       RETURNING id`,
      [id, hash, null, null, null, null, phone, now, "pending", null, null, now],
    );
    if (!inserted)
      return { statusCode: 200, body: { ok: true, status: "duplicate" } };
    const outcome = await matchOrder(db, tx, parsed, now);
    await tx.run(
      `UPDATE sms_payment_events
       SET account_masked=?, amount_mnt=?, utga=?, order_code=?, status=?, unmatched_reason=?, order_id=?
       WHERE id=?`,
      [
        outcome.account,
        outcome.amount,
        outcome.utga,
        outcome.code,
        outcome.status,
        outcome.reason,
        outcome.orderId,
        inserted.id,
      ],
    );
    const body = { ok: true, status: outcome.status, eventId: inserted.id };
    if (outcome.reason) body.reason = outcome.reason;
    if (outcome.status === "activated") body.orderCode = outcome.code;
    return { statusCode: 200, body };
  });
}

export async function linkSmsEvent(db, { id, code, note, actorId, now }) {
  return db.transaction(async (tx) => {
    const event = await tx.get("SELECT * FROM sms_payment_events WHERE id=?", [id]);
    if (!event || !["unmatched", "rejected"].includes(event.status))
      return { error: "invalid_status" };
    if (event.amount_mnt == null) return { error: "amount_required" };
    if (db.dialect === "postgres")
      await tx.get("SELECT id FROM orders WHERE code=? FOR UPDATE", [code]);
    const order = await tx.get("SELECT * FROM orders WHERE code=?", [code]);
    if (!order) return { error: "not_found" };
    if (Number(order.amount_mnt) !== Number(event.amount_mnt))
      return { error: "amount_mismatch" };
    const activated = await activateOrder(tx, {
      code,
      actorId,
      now,
      note,
      source: "manual",
    });
    if (activated.error) return activated;
    if (activated.alreadyPaid) return { error: "already_paid" };
    await tx.run(
      "UPDATE sms_payment_events SET status='activated', order_id=?, order_code=?, review_note=? WHERE id=?",
      [activated.order.id, code, note, id],
    );
    return { ok: true, endsAt: activated.endsAt };
  });
}
