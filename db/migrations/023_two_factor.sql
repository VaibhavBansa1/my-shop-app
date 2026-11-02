-- 023: two-factor login (authenticator app codes, RFC 6238) and one-time recovery codes.
alter table users
  add column totp_secret      text,          -- encrypted (enc:v1:) base32 secret once 2FA is on
  add column totp_pending     text,          -- encrypted secret being set up, not active yet
  add column totp_enabled_at  timestamptz,
  add column totp_last_step   bigint;        -- last accepted 30-second step: a code works only once

create table recovery_codes (
  id         bigserial primary key,
  user_id    uuid not null references users(id) on delete cascade,
  code_hash  bytea not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index recovery_codes_user_idx on recovery_codes(user_id) where used_at is null;
grant select, insert, update, delete on recovery_codes to shop_app;
grant usage, select on sequence recovery_codes_id_seq to shop_app;
