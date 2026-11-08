# Security changes still waiting on the owner

The application now enforces a timed entitlement, serves paid audio only after that check, and keeps admin actions for one configured Google subject. These items are not done by the code:

- Confirm the GitHub repository is private. History was not rewritten. Copies made while it was public still exist. Paid audio moved from `public/media` to `private/media`; that does not remove the old files from git history.
- Set `OWNER_GOOGLE_SUB` in Vercel to the Google `sub` of the only owner. Leave it empty and `/admin` stays closed. Turn on multi-factor authentication for that Google account.
- In Supabase, confirm `anon` and `authenticated` cannot read `orders`, `entitlements`, `sms_payment_events`, `user_sessions`, or `account_notices`. Do not dump customer rows. The boot path enables row-level security and revokes those roles; the live grants were not queried from here.
- Take a backup and restore it on a throwaway database before relying on a production migration. Backup status was not verified.
- Generate `SMS_WEBHOOK_TOKEN` locally and set a different value for preview and production. Do not turn on the phone shortcut until a staging check returns 401 without the token.
- `lateGraceHours` is not a rule. There is no automatic late cutoff. An expired bank SMS stays unmatched for a manual decision.
- Natural IELTS recordings were not generated or replaced.

Paid listening files are streamed by the API with `Cache-Control: private, no-store`. They are no longer copied into the public site folder. The Vercel function is configured to include `private/media`. If that bundle is too large for the host, keep the files off the public CDN and move them to private object storage rather than putting them back under `public/`.
