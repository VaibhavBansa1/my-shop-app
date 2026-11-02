-- 020: Idempotency keys: a retried or double-tapped "Save" returns the first result instead of a duplicate bill.
create table idempotency_keys (
  org_id       uuid not null references organizations(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  key          text not null check (key ~ '^[A-Za-z0-9_-]{8,100}$'),
  request_hash text not null,
  status       integer,                 -- null while the first request is still running
  response     jsonb,
  created_at   timestamptz not null default now(),
  primary key (org_id, user_id, key)
);
alter table idempotency_keys enable row level security;
alter table idempotency_keys force row level security;
create policy own_keys on idempotency_keys for all
  using (org_id = app_org_id() and user_id = app_user_id()) with check (org_id = app_org_id() and user_id = app_user_id());
create policy owner_definer on idempotency_keys for all to shop_owner using (true) with check (true);
grant select, insert, update, delete on idempotency_keys to shop_app;

create or replace function purge_idempotency_keys() returns integer
language sql security definer set search_path = public, pg_temp as $$
  with d as (delete from idempotency_keys where created_at < now() - interval '24 hours' returning 1) select count(*)::int from d
$$;
revoke all on function purge_idempotency_keys() from public;
grant execute on function purge_idempotency_keys() to shop_app;
