import test from "node:test";
import assert from "node:assert/strict";
import { parseKhanSms } from "../server/sms.mjs";
import { priceFor } from "../src/config/pricing.js";

const sample =
  "Tany 5***0218 dansand ORLOGO:5,000.00MNT orj ULDEGDEL:5,010.00MNT bolloo.Utga:sms";

test("khan bank sms fixtures", () => {
  const real = parseKhanSms(sample);
  assert.equal(real.amount, 5000);
  assert.equal(real.balance, 5010);
  assert.equal(real.note, "sms");
  assert.equal(real.code, null);
  assert.equal(
    parseKhanSms(sample.replace("Utga:sms", "Utga:ES-4821")).code,
    "ES-4821",
  );
  assert.equal(
    parseKhanSms(sample.replace("Utga:sms", "Utga:es4821")).code,
    "ES-4821",
  );
  assert.equal(
    parseKhanSms(sample.replace("Utga:sms", "Utga:ES 4821")).code,
    "ES-4821",
  );
  assert.equal(
    parseKhanSms(sample.replace("Utga:sms", "Utga:ЕС-4821")).code,
    "ES-4821",
  );
  assert.equal(
    parseKhanSms(sample.replace("Utga:sms", "Utga:Bat-Erdene ES-4821 IELTS"))
      .code,
    "ES-4821",
  );
  assert.equal(
    parseKhanSms(
      "Tany 5***0218 dansand ZARLAGA:2,000.00MNT garch ULDEGDEL:98,510.00MNT bolloo.Utga:hool",
    ).parseStatus,
    "ignored_debit",
  );
  assert.equal(
    parseKhanSms(sample.replace("0218", "9999")).parseStatus,
    "ignored_account",
  );
  assert.equal(
    parseKhanSms(sample.replace("Utga:sms", "Utga:tes4821x")).code,
    null,
  );
  assert.equal(parseKhanSms("Hello, your package is waiting").parseStatus, "ignored_other");
  assert.equal(priceFor("month", 3, Date.parse("2026-11-01T00:00:00+08:00")).amount, 24000);
  assert.equal(priceFor("week", 1, Date.parse("2026-11-01T00:00:00+08:00")).amount, 3500);
  assert.equal(priceFor("month", 1, Date.parse("2026-11-09T00:00:00+08:00")).amount, 20000);
});
