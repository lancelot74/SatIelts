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

## Production

Run the same command from a trusted machine, with `DATABASE_URL` set to the database you intend to change. Prefer the session pooler or a direct connection for DDL. The transaction pooler can apply this migration, but it is a poor place for later migrations that need a session-level lock.

Apply the migration before deploying a build that expects the new version. Until `2026-11-10-baseline` is recorded, production instances will refuse to boot rather than change the schema themselves.

To run it as a Vercel build step later, set `DATABASE_URL` on the project and change the build command to `npm run migrate && npm run build`. That wiring is intentionally not in this change. Do not point a build at production until you have run the migration yourself and checked `/api/health`.

`server/migrations/2026-11-08-millis-bigint.sql` remains the manual script for the older integer-to-bigint rewrite. The baseline file includes that rewrite, so a normal `npm run migrate` covers it.
