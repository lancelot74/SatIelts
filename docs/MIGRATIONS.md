# Database migrations

The API no longer creates or alters tables when it starts. `npm run migrate` applies the ordered SQL files in `migrations/`. Each file name (without `.sql`) is the version stored in `public.schema_migrations`. The runner takes transaction advisory lock `814763219` and sets `lock_timeout` to 8 seconds, so two migrators cannot rewrite the same tables at once.

The first file, `2026-11-10-baseline.sql`, matches the schema the server used to build on boot. It uses `IF NOT EXISTS` and only widens a timestamp column when that column is still `integer`. Running it on the current production database does not rebuild existing tables.

Boot only checks that the latest migration id is present. If it is missing, the process logs `migration required` and does not execute DDL. Set `RUN_MIGRATIONS_ON_BOOT=1` for a local database or the test suite when you want the process to apply migrations itself. Do not set that variable on the production Vercel project. This change does not add a migrate step to `vercel.json`.

## Run it locally

Use a Postgres URL you are allowed to change. The command reads `DATABASE_URL` from the environment or from `.env` and does not print it.

```bash
DATABASE_URL='postgres://study:study@127.0.0.1:5432/studyroom' npm run migrate
```

A second run does nothing if every file is already recorded.

## Deploy order

1. Apply the migrations to the database this deploy will use. Run `npm run migrate` from a trusted machine. Prefer a direct connection or the session pooler for DDL. Do not point a preview or a Vercel build at the production URL.
2. Check that `schema_migrations` contains the latest file name, currently `2026-11-10-runtime`.
3. Deploy or promote the application. `vercel.json` only runs `npm run build`. It does not migrate.
4. Open `/api/health` and confirm `"database": "postgres"`.

`RUN_MIGRATIONS_ON_BOOT` must stay unset in production and in any preview that shares the production database.

If traffic hits an instance before step 1, that instance answers `migration_required` and tries again after about 5 seconds. A later migration repairs those instances without a restart. Any other boot failure stays failed until the process is replaced.

## Index builds

`2026-11-10-baseline.sql` creates `entitlements_email_lower`, `orders_user`, and `account_notices_email_lower` inside its transaction. PostgreSQL blocks writes to a table while a normal `CREATE INDEX` runs. Those tables store purchases, grants, and short notices for one academy, so the lock is expected to be brief. `CREATE INDEX CONCURRENTLY` cannot run inside the runner's transaction. Add a separate file, executed outside the transaction, only if one of those tables becomes large enough for the lock to matter.

## Production

`server/migrations/2026-11-08-millis-bigint.sql` remains the manual script for the older integer-to-bigint rewrite. The baseline file includes that rewrite, so a normal `npm run migrate` covers it.
