-- 008: email verification for accounts.
alter table users add column email_verified_at timestamptz;

create table email_verifications (
  token_hash bytea primary key,                 -- sha256 of the emailed token
  user_id    uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);
create index email_verifications_user_idx on email_verifications(user_id);
grant select, insert, update, delete on email_verifications to shop_app;
