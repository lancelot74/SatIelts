-- Version 2026-11-08-millis-bigint.
-- Same transaction, advisory lock, timeouts, column order, and final check
-- as widenMillis in server/db.mjs. Safe to run more than once. A column is
-- rewritten only while it is still integer. Values and NULLs stay.
--
-- A failed application boot is remembered by that process. The next request
-- on the same isolate does not try again. Run this file yourself, as the
-- table owner, during a quiet moment if you want the rewrite done before
-- deploy. A later isolate can boot after the columns are already bigint.

begin;
select set_config('lock_timeout', '2000', true);
select set_config('statement_timeout', '8000', true);
select pg_advisory_xact_lock(814763219);

create table if not exists public.schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;

do $$
declare
  item text[];
  kind text;
  plan text[][] := array[
    array['entitlements', 'starts_at'],
    array['entitlements', 'ends_at'],
    array['entitlements', 'created_at'],
    array['orders', 'created_at'],
    array['orders', 'expires_at'],
    array['orders', 'paid_at']
  ];
begin
  foreach item slice 1 in array plan loop
    select data_type into kind
    from information_schema.columns
    where table_schema = 'public'
      and table_name = item[1]
      and column_name = item[2];
    if kind = 'integer' then
      execute format('alter table public.%I alter column %I type bigint', item[1], item[2]);
    elsif kind is distinct from 'bigint' then
      raise exception 'millis migration incomplete: public.%.%', item[1], item[2];
    end if;
  end loop;
end $$;

insert into public.schema_migrations (id)
values ('2026-11-08-millis-bigint')
on conflict (id) do nothing;
commit;
