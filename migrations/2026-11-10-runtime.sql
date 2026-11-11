-- Columns and the optional shared rate-limit table added after the baseline.
-- answers_rev orders autosave writes. active distinguishes a login that has
-- been saved from one that is still pending. Existing rows default to active.

alter table runs add column if not exists answers_rev bigint not null default 0;

alter table user_sessions add column if not exists active integer not null default 1;

create table if not exists rate_limit_hits (
  bucket text not null,
  window_start bigint not null,
  hits integer not null,
  primary key (bucket, window_start)
);

alter table rate_limit_hits enable row level security;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on table rate_limit_hits from %I', role_name);
    end if;
  end loop;
end $$;
