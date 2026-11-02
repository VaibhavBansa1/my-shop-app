-- 015: security event log, feature flags, Postgres job queue, report-cache versioning.

-- Security events (sign-ins, failures, denials, rate limits, password/session changes).
create table security_events (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  event      text not null check (event ~ '^[a-z_.]{3,60}$'),
  user_id    uuid references users(id) on delete set null,
  org_id     uuid,
  ip         text check (length(ip) <= 64),
  user_agent text check (length(user_agent) <= 300),
  request_id text check (length(request_id) <= 64),
  detail     text check (length(detail) <= 500)
);
create index security_events_user_idx on security_events(user_id, at desc);
create index security_events_event_idx on security_events(event, at desc);
alter table security_events enable row level security;
alter table security_events force row level security;
-- People can read their own security history; anyone (incl. anonymous login failures) can be recorded.
create policy security_events_own on security_events for select using (user_id = app_user_id());
create policy security_events_insert on security_events for insert with check (true);
create policy owner_definer on security_events for all to shop_owner using (true) with check (true);
grant select, insert on security_events to shop_app;
grant usage, select on sequence security_events_id_seq to shop_app;

-- Feature flags: global switches with optional percentage rollout and per-business allow/deny lists.
-- Read-only for the app; changed by the operator (npm run flags).
create table feature_flags (
  key             text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  enabled         boolean not null default true,
  rollout_percent integer not null default 100 check (rollout_percent between 0 and 100),
  allow_orgs      uuid[] not null default '{}',
  deny_orgs       uuid[] not null default '{}',
  description     text not null default '',
  updated_at      timestamptz not null default now()
);
grant select on feature_flags to shop_app;
insert into feature_flags (key, description) values
  ('ocr', 'Invoice scanning (OCR)'),
  ('ai', 'AI shop summaries (also needs AI_PROVIDER and the business opt-in)'),
  ('reminders', 'Payment reminders to customers'),
  ('import', 'CSV import'),
  ('daily_summary', 'Daily summary notifications and emails');

-- Background jobs (used when Redis is not configured). Payloads are encrypted by the app.
create table jobs (
  id           bigserial primary key,
  queue        text not null default 'default',
  name         text not null check (name ~ '^[a-z_.]{2,60}$'),
  payload      text not null default '',
  run_at       timestamptz not null default now(),
  attempts     integer not null default 0,
  max_attempts integer not null default 5,
  locked_at    timestamptz,
  locked_by    text,
  last_error   text,
  done_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index jobs_ready_idx on jobs(queue, run_at) where done_at is null;
grant select, insert, update, delete on jobs to shop_app;
grant usage, select on sequence jobs_id_seq to shop_app;

-- Report cache invalidation: any change to a business's books bumps its data version.
alter table organizations add column data_version bigint not null default 0;
create or replace function bump_org_version() returns trigger
language plpgsql as $$
begin
  update organizations set data_version = data_version + 1 where id = coalesce(new.org_id, old.org_id);
  return null;
end $$;
create trigger vouchers_bump after insert or update on vouchers for each row execute function bump_org_version();
create trigger ledgers_bump after insert or update on ledgers for each row execute function bump_org_version();
create trigger stock_items_bump after insert or update on stock_items for each row execute function bump_org_version();
