-- 007: password reset tokens (identity data, not tenant-scoped, so no RLS).
create table password_resets (
  token_hash bytea primary key,                  -- sha256 of the emailed token
  user_id    uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz
);
create index password_resets_user_idx on password_resets(user_id);

grant select, insert, update, delete on password_resets to shop_app;
