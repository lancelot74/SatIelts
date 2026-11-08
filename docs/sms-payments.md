# Khan Bank SMS payments

Khan Bank SMS is **not** cryptographically authenticated to this server. Security rests on:

1. Secrecy of `SMS_WEBHOOK_TOKEN`.
2. The owner's phone sending only bank **credit** notifications (`ORLOGO`), never one-time passwords.
3. Fail-closed checks: account ending `0218`, an existing unpaid order code, and an exact integer amount match.
4. A durable unmatched queue. The balance (`ULDEGDEL`) never grants access.

A person who learns the token can submit forged text. They still cannot open access unless that text names an unpaid order and the exact amount already stored on that order. Sale prices are not hardcoded here. The order row is the source of truth.

Do not enable the iPhone Shortcut until this route is deployed and the checks below have been run. Generating the token, setting it in Vercel, and turning on the phone are owner steps. Never paste the token into chat, git, or a screenshot.

## Contract

`POST /api/payments/sms`

Header: `X-SMS-Token` must match `SMS_WEBHOOK_TOKEN` with a timing-safe compare. If the variable is missing or empty, the route returns 401.

```json
{ "text": "<full SMS>", "received_at": "<optional ISO timestamp, untrusted>" }
```

No browser session. This path is the only CSRF exemption, and only for POST. There is no open CORS policy on the route.

| Result | HTTP | Body |
| --- | --- | --- |
| Missing or wrong token, or token unset | 401 | `{ "ok": false, "error": "unauthorized" }` |
| Missing, empty, or overlong text (2,000 characters) | 400 | `{ "ok": false, "error": "invalid_body" }` |
| Order activated | 200 | `{ "ok": true, "status": "activated", "orderCode": "ES-…" }` |
| Stored for review | 200 | `{ "ok": true, "status": "unmatched", "reason": "…" }` |
| Not a credit to this account | 200 | `{ "ok": true, "status": "rejected", "reason": "…" }` |
| Same text already stored | 200 | `{ "ok": true, "status": "duplicate" }` |
| More than 30 requests from one IP in 10 minutes | 429 | `{ "ok": false, "error": "rate_limited" }` |

`GET /api/payments/sms` does not ingest. A garbage `received_at` is ignored. A valid one is stored as phone metadata only. The server clock is the time used for activation.

Amounts are integer tögrög, the same unit as `orders.amount_mnt`. `5,000.00` matches an order of `5000`. A fractional amount such as `4999.99` does not match. Underpay, overpay, unknown code, missing code, cancelled order, and an already-paid order stay unpaid and do not add a second entitlement.

The dedupe key is the SHA-256 of the **exact** `text` string. Amount plus balance is not a dedupe key. Two different notes are two events.

Expired orders can still be matched. That is the same rule as manual approval, which already accepts status `expired`.

## Admin

`/admin` lists unmatched and rejected events for an administrator: time, masked account, amount, transfer note, and reason. It does not show the webhook token or the account balance.

- Dismiss stores a note of at least 3 characters and removes the event from the queue.
- Link runs the same activation as manual approval, and only when the event's amount equals the order amount.
- `POST /api/admin/orders/approve` is unchanged and remains the fallback when an SMS cannot be matched.

Both actions require an admin session and the CSRF header.

## What is stored

`sms_payment_events` keeps the hash, masked account (`*****0218`), integer amount, transfer note (180 characters), extracted code, phone timestamp, server timestamp, status, and reason. It does **not** store the raw SMS or `ULDEGDEL`.

Rows stay until an admin dismisses them or they are linked to a paid order. There is no automatic deletion job. Treat the transfer note as personal data and review the queue rather than exporting it.

Rate-limit rows store an IP address for 10 minutes.

On Postgres, `sms_payment_events`, `sms_rate_hits`, `orders`, and `entitlements` have row-level security enabled and `anon` / `authenticated` are revoked. The API connects as the table owner.

## Owner setup

On your own machine:

```bash
openssl rand -hex 32
```

Put that value only in Vercel as `SMS_WEBHOOK_TOKEN`, for Production and for any Preview you will test. Redeploy. Put the same value in the phone header later. Do not commit it.

Check in this order:

1. `GET /api/health` returns 200.
2. `GET /api/payments/sms` does not ingest (404).
3. `POST` with no token, then with a wrong token, returns 401.
4. A credit SMS with no `ES-` code stays unmatched and opens nothing.
5. An unpaid order plus a text whose amount matches activates once. The same text again is `duplicate`.
6. Creating an order without the CSRF header is still rejected.

Only then turn on the phone automation, and only for messages that contain `ORLOGO`.

## Rollback

1. Turn off the iPhone message automation.
2. Remove or replace `SMS_WEBHOOK_TOKEN` in Vercel and redeploy. The route then fails closed with 401.
3. Promote the previous Vercel deployment if a release activates the wrong orders. The new tables can stay; they are unused by the older code.
4. Confirm payments with `POST /api/admin/orders/approve` until the webhook is trusted again.
5. If a bad match opened access, revoke that student from `/admin`.

Heartbeat is not part of this route. A missing heartbeat does not block a payment SMS.
