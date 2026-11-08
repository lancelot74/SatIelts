import { timingSafeEqual } from "node:crypto";
import { payment } from "../src/config/payment.js";

// Khan Bank SMS is not cryptographically authenticated. A caller who knows
// SMS_WEBHOOK_TOKEN can submit any text. Access is granted only when that
// text matches an unpaid order's code and integer amount. The balance
// (ULDEGDEL) is never payment authority.

const accountPattern = /Tany\s+(\d)\*+(\d{4})\s+dansand/i;
const incomingPattern = /ORLOGO:\s*([\d,]+(?:\.\d{1,2})?)\s*MNT/i;
const outgoingPattern = /ZARLAGA:\s*([\d,]+(?:\.\d{1,2})?)\s*MNT/i;
const balancePattern = /ULDEGDEL:\s*(-?[\d,]+(?:\.\d{1,2})?)\s*MNT/i;
const notePattern = /Utga:\s*([\s\S]*)$/i;
const codePattern =
  /(?:^|[^A-Za-zА-Яа-яЁё0-9])[EЕeе]\s*[SСsс][\s\-_.:#№]*(\d{4,5})(?!\d)/u;

export function normalizeSms(text) {
  return String(text ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");
}

function tugrug(raw) {
  const cleaned = String(raw).replace(/,/g, "");
  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) return null;
  const fractional = cleaned.includes(".")
    ? cleaned.split(".")[1].replace(/0+$/, "")
    : "";
  return { amount: Math.trunc(amount), fractional: fractional.length > 0 };
}

export const SMS_TEXT_MAX = 2000;

export function tokenMatches(header, secret) {
  if (typeof secret !== "string" || secret.length === 0) return false;
  if (typeof header !== "string" || header.length === 0) return false;
  const provided = Buffer.from(header);
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export function phoneReceivedAt(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 40)
    return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? value : null;
}

export function orderCodeIn(note) {
  const match = codePattern.exec(String(note ?? ""));
  return match ? `ES-${match[1]}` : null;
}

export function parseKhanSms(text, bank = payment.bank) {
  const normalized = normalizeSms(text);
  if (!/ORLOGO/i.test(normalized) && !/ZARLAGA/i.test(normalized))
    return { parseStatus: "ignored_other", normalized };
  const account = accountPattern.exec(normalized);
  if (!account) return { parseStatus: "unparsed", normalized };
  if (account[2] !== bank.accountLast4)
    return { parseStatus: "ignored_account", accountLast4: account[2], normalized };
  const outgoing = outgoingPattern.exec(normalized);
  const incoming = incomingPattern.exec(normalized);
  if (outgoing && !incoming) return { parseStatus: "ignored_debit", normalized };
  if (!incoming) return { parseStatus: "unparsed", normalized };
  const amount = tugrug(incoming[1]);
  const balanceMatch = balancePattern.exec(normalized);
  const balance = balanceMatch ? tugrug(balanceMatch[1]) : null;
  const note = (notePattern.exec(normalized)?.[1] ?? "").trim();
  const code = orderCodeIn(note);
  return {
    parseStatus: amount.fractional ? "needs_review" : "parsed",
    normalized,
    accountLast4: account[2],
    amount: amount.amount,
    fractional: amount.fractional,
    balance: balance?.amount ?? null,
    note,
    code,
  };
}
