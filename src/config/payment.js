export const payment = {
  method: "bank_transfer",
  bank: {
    name: "Khan Bank",
    nameMn: "Хаан банк",
    iban: "MN820005005076290218",
    accountLast4: "0218",
    holder: "Azbileg Uurtsaikh",
  },
  order: {
    codePrefix: "ES-",
    codeDigits: 4,
    ttlHours: 24,
    // Not enforced. No late cutoff was approved. The owner may still confirm
    // an expired order after checking the transfer. SMS never does that itself.
    lateGraceHours: null,
  },
  sms: {
    format: "khanbank-latin-v1",
    senderIds: [],
    incomingKeyword: "ORLOGO",
    outgoingKeyword: "ZARLAGA",
    dedupeWindowMinutes: 15,
    heartbeatAlertHours: 6,
    silenceAlertHours: 12,
  },
};

export function formatIban(iban = payment.bank.iban) {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}
