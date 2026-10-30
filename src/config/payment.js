export const payment = {
  method: "bank_transfer",
  bank: {
    name: "Khan Bank",
    nameMn: "Хаан банк",
    iban: "MN820005005076290218",
    accountLast4: "0218",
    holder: "Azbileg Uurtsaikh",
  },
  order: { codePrefix: "ES-", codeDigits: 4, ttlHours: 24, lateGraceHours: 72 },
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
