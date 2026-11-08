-- Version 2026-11-08-millis-bigint.
-- Optional manual step before deploy. Boot runs the same change itself.
-- Safe to run more than once. It rewrites a column only while that column
-- is still integer. Values and NULLs stay. Do not run this on a database
-- other than this application database.
--
-- Deploy:
-- 1. Optional, during a quiet moment, run this file as the table owner.
-- 2. Deploy the application. Each cold start takes advisory lock 814763219,
--    rechecks public.orders and public.entitlements, and alters only the
--    columns that are still integer. Waiters fail at 2s and retry twice.
--    A start that still cannot lock closes its client and the next request
--    tries again. Fresh databases already create these columns as bigint.
-- 3. Confirm the six columns are bigint before relying on Google sign-in.

create table if not exists public.schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;

alter table public.orders
  alter column created_at type bigint,
  alter column expires_at type bigint,
  alter column paid_at type bigint;
alter table public.entitlements
  alter column starts_at type bigint,
  alter column ends_at type bigint,
  alter column created_at type bigint;

insert into public.schema_migrations (id)
values ('2026-11-08-millis-bigint')
on conflict (id) do nothing;
