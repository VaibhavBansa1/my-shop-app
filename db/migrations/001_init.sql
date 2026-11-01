-- 001_init.sql — core schema for My Shop App.
-- Run by the migration role (shop_owner). The app connects as shop_app,
-- which does not own these tables and therefore is subject to RLS.
-- See docs/DATABASE.md for a description of every table.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Request context helpers. withOrg() in lib/db.js does SET LOCAL app.org_id /
-- app.user_id inside a transaction; policies read them through these helpers.
-- ---------------------------------------------------------------------------
create or replace function app_org_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.org_id', true), '')::uuid
$$;

create or replace function app_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- Identity (global, not tenant-scoped)
-- ---------------------------------------------------------------------------
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique check (length(email) between 3 and 254),
  name          text   not null check (length(name) between 1 and 120),
  password_hash text   not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table sessions (
  token_hash   bytea primary key,                 -- sha256(token); the token itself is never stored
  user_id      uuid not null references users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null,
  ip           text,
  user_agent   text check (length(user_agent) <= 512)
);
create index sessions_user_idx on sessions(user_id);
create index sessions_expires_idx on sessions(expires_at);

create table login_attempts (
  id         bigserial primary key,
  key        text not null,                       -- 'email:<email>' or 'ip:<ip>'
  success    boolean not null,
  at         timestamptz not null default now()
);
create index login_attempts_key_at_idx on login_attempts(key, at desc);

-- ---------------------------------------------------------------------------
-- Organizations and membership
-- ---------------------------------------------------------------------------
create type org_role as enum ('owner', 'admin', 'accountant', 'cashier', 'viewer');

create table organizations (
  id             uuid primary key,
  name           text not null check (length(name) between 1 and 120),
  legal_name     text not null default '' check (length(legal_name) <= 200),
  gstin          text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  state_code     text check (state_code is null or state_code ~ '^[0-9]{2}$'),
  country        text not null default 'IN' check (country ~ '^[A-Z]{2}$'),
  currency       text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  address        text not null default '' check (length(address) <= 500),
  phone          text not null default '' check (length(phone) <= 40),
  email          text not null default '' check (length(email) <= 254),
  fy_start_month smallint not null default 4 check (fy_start_month between 1 and 12),
  books_from     date not null default current_date,
  created_by     uuid not null references users(id),
  created_at     timestamptz not null default now()
);

create table memberships (
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  role       org_role not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on memberships(user_id);

create table invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  email       citext not null,
  role        org_role not null check (role <> 'owner'),
  token_hash  bytea not null unique,
  invited_by  uuid not null references users(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references users(id),
  revoked_at  timestamptz
);
create index invitations_org_idx on invitations(org_id);

-- ---------------------------------------------------------------------------
-- Chart of accounts
-- Composite foreign keys (org_id, id) make cross-tenant references impossible.
-- ---------------------------------------------------------------------------
create type group_nature as enum ('asset', 'liability', 'equity', 'income', 'expense');

create table account_groups (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  parent_id            uuid,
  name                 text not null check (length(name) between 1 and 100),
  code                 text,                      -- stable key for system groups, e.g. 'sundry_debtors'
  nature               group_nature not null,
  affects_gross_profit boolean not null default false,
  is_system            boolean not null default false,
  created_at           timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, name),
  unique (org_id, code),
  foreign key (org_id, parent_id) references account_groups(org_id, id)
);

create table ledgers (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  group_id        uuid not null,
  name            text not null check (length(name) between 1 and 120),
  code            text,                           -- stable key for system ledgers, e.g. 'cash', 'output_cgst'
  opening_balance numeric(14,2) not null default 0, -- debit positive, credit negative
  gstin           text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  state_code      text check (state_code is null or state_code ~ '^[0-9]{2}$'),
  phone           text not null default '' check (length(phone) <= 40),
  email           text not null default '' check (length(email) <= 254),
  address         text not null default '' check (length(address) <= 500),
  is_system       boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, name),
  unique (org_id, code),
  foreign key (org_id, group_id) references account_groups(org_id, id)
);
create index ledgers_group_idx on ledgers(org_id, group_id);

-- ---------------------------------------------------------------------------
-- Inventory masters
-- ---------------------------------------------------------------------------
create table units (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references organizations(id) on delete cascade,
  symbol   text not null check (length(symbol) between 1 and 12),
  name     text not null check (length(name) between 1 and 60),
  decimals smallint not null default 0 check (decimals between 0 and 3),
  unique (org_id, id),
  unique (org_id, symbol)
);

create table stock_items (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  name           text not null check (length(name) between 1 and 160),
  sku            text not null default '' check (length(sku) <= 60),
  unit_id        uuid not null,
  hsn_code       text not null default '' check (hsn_code ~ '^[0-9]{0,8}$'),
  gst_rate       numeric(5,2) not null default 0 check (gst_rate between 0 and 100),
  sale_price     numeric(14,2) not null default 0 check (sale_price >= 0),
  purchase_price numeric(14,2) not null default 0 check (purchase_price >= 0),
  reorder_level  numeric(14,3) not null default 0 check (reorder_level >= 0),
  opening_qty    numeric(14,3) not null default 0,
  opening_rate   numeric(14,2) not null default 0 check (opening_rate >= 0),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, name),
  foreign key (org_id, unit_id) references units(org_id, id)
);
create unique index stock_items_sku_uq on stock_items(org_id, sku) where sku <> '';

-- ---------------------------------------------------------------------------
-- Vouchers (transactions). Append-only: cancel instead of delete.
-- ---------------------------------------------------------------------------
create type voucher_type as enum
  ('sales', 'purchase', 'receipt', 'payment', 'contra', 'journal', 'credit_note', 'debit_note');
create type voucher_status as enum ('posted', 'cancelled');

create table voucher_sequences (
  org_id   uuid not null references organizations(id) on delete cascade,
  type     voucher_type not null,
  fy_start date not null,
  next_no  integer not null default 1 check (next_no > 0),
  primary key (org_id, type, fy_start)
);

create table vouchers (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  type            voucher_type not null,
  fy_start        date not null,
  number          integer not null check (number > 0),
  date            date not null,
  party_ledger_id uuid,
  place_of_supply text check (place_of_supply is null or place_of_supply ~ '^[0-9]{2}$'),
  reference       text not null default '' check (length(reference) <= 80),
  narration       text not null default '' check (length(narration) <= 1000),
  taxable_total   numeric(14,2) not null default 0,
  tax_total       numeric(14,2) not null default 0,
  round_off       numeric(14,2) not null default 0,
  total           numeric(14,2) not null default 0,
  status          voucher_status not null default 'posted',
  cancelled_at    timestamptz,
  cancelled_by    uuid references users(id),
  cancel_reason   text check (length(cancel_reason) <= 300),
  created_by      uuid not null references users(id),
  created_at      timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, type, fy_start, number),
  foreign key (org_id, party_ledger_id) references ledgers(org_id, id)
);
create index vouchers_org_date_idx on vouchers(org_id, date desc, created_at desc);
create index vouchers_party_idx on vouchers(org_id, party_ledger_id);

create table voucher_entries (
  id         bigserial primary key,
  org_id     uuid not null,
  voucher_id uuid not null,
  line_no    smallint not null,
  ledger_id  uuid not null,
  amount     numeric(14,2) not null check (amount <> 0), -- debit positive, credit negative
  foreign key (org_id, voucher_id) references vouchers(org_id, id) on delete cascade,
  foreign key (org_id, ledger_id) references ledgers(org_id, id),
  unique (voucher_id, line_no)
);
create index voucher_entries_ledger_idx on voucher_entries(org_id, ledger_id);

create table voucher_items (
  id            bigserial primary key,
  org_id        uuid not null,
  voucher_id    uuid not null,
  line_no       smallint not null,
  stock_item_id uuid not null,
  description   text not null default '' check (length(description) <= 300),
  qty           numeric(14,3) not null check (qty > 0),
  rate          numeric(14,2) not null check (rate >= 0),
  discount      numeric(14,2) not null default 0 check (discount >= 0),
  taxable_value numeric(14,2) not null,
  gst_rate      numeric(5,2) not null default 0,
  cgst          numeric(14,2) not null default 0,
  sgst          numeric(14,2) not null default 0,
  igst          numeric(14,2) not null default 0,
  stock_qty     numeric(14,3) not null,  -- signed: + stock in, - stock out
  foreign key (org_id, voucher_id) references vouchers(org_id, id) on delete cascade,
  foreign key (org_id, stock_item_id) references stock_items(org_id, id),
  unique (voucher_id, line_no)
);
create index voucher_items_item_idx on voucher_items(org_id, stock_item_id);

-- Every voucher must balance (sum of entries = 0) and have at least two entries.
-- Deferred so the whole voucher can be inserted before the check runs at commit.
create or replace function check_voucher_balanced() returns trigger
language plpgsql as $$
declare
  v_id uuid;
  v_sum numeric;
  v_count int;
begin
  if tg_table_name = 'vouchers' then
    v_id := new.id;
  elsif tg_op = 'DELETE' then
    v_id := old.voucher_id;
  else
    v_id := new.voucher_id;
  end if;
  select coalesce(sum(amount), 0), count(*) into v_sum, v_count
    from voucher_entries where voucher_id = v_id;
  if exists (select 1 from vouchers where id = v_id) and (v_sum <> 0 or v_count < 2) then
    raise exception 'voucher % is not balanced (sum %, entries %)', v_id, v_sum, v_count
      using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger voucher_entries_balanced
  after insert or update or delete on voucher_entries
  deferrable initially deferred
  for each row execute function check_voucher_balanced();

create constraint trigger vouchers_balanced
  after insert on vouchers
  deferrable initially deferred
  for each row execute function check_voucher_balanced();

-- Posted vouchers are immutable except for the one-way move to 'cancelled'.
create or replace function guard_voucher_update() returns trigger
language plpgsql as $$
begin
  if old.status = 'cancelled' then
    raise exception 'cancelled vouchers cannot be changed' using errcode = '42501';
  end if;
  if new.status <> 'cancelled'
     or (new.id, new.org_id, new.type, new.fy_start, new.number, new.date, new.party_ledger_id,
         new.place_of_supply, new.reference, new.narration, new.taxable_total, new.tax_total,
         new.round_off, new.total, new.created_by, new.created_at)
        is distinct from
        (old.id, old.org_id, old.type, old.fy_start, old.number, old.date, old.party_ledger_id,
         old.place_of_supply, old.reference, old.narration, old.taxable_total, old.tax_total,
         old.round_off, old.total, old.created_by, old.created_at)
  then
    raise exception 'posted vouchers can only be cancelled' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger vouchers_guard_update before update on vouchers
  for each row execute function guard_voucher_update();

-- ---------------------------------------------------------------------------
-- Audit log (append-only for the app role: only SELECT/INSERT are granted)
-- ---------------------------------------------------------------------------
create table audit_log (
  id        bigserial primary key,
  org_id    uuid not null references organizations(id) on delete cascade,
  user_id   uuid references users(id),
  action    text not null,             -- e.g. 'voucher.create', 'member.role_change'
  entity    text not null,
  entity_id text,
  data      jsonb not null default '{}'::jsonb,
  at        timestamptz not null default now()
);
create index audit_log_org_at_idx on audit_log(org_id, at desc);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table organizations enable row level security;
alter table organizations force row level security;
create policy org_select on organizations for select
  using (id = app_org_id()
         or id in (select m.org_id from memberships m where m.user_id = app_user_id()));
create policy org_insert on organizations for insert
  with check (created_by = app_user_id() and id = app_org_id());
create policy org_update on organizations for update
  using (id = app_org_id()) with check (id = app_org_id());
create policy org_delete on organizations for delete
  using (id = app_org_id());

alter table memberships enable row level security;
alter table memberships force row level security;
create policy memberships_select on memberships for select
  using (org_id = app_org_id() or user_id = app_user_id());
create policy memberships_write on memberships for all
  using (org_id = app_org_id()) with check (org_id = app_org_id());

do $$
declare t text;
begin
  foreach t in array array['invitations', 'account_groups', 'ledgers', 'units', 'stock_items',
                           'voucher_sequences', 'vouchers', 'voucher_entries', 'voucher_items',
                           'audit_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy tenant_isolation on %I for all using (org_id = app_org_id()) with check (org_id = app_org_id())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Invitation acceptance runs before the user is a member, so it cannot see the
-- invitation through RLS. This narrowly-scoped SECURITY DEFINER function looks
-- up one invitation by token hash and creates the membership.
-- ---------------------------------------------------------------------------
create or replace function accept_invitation(p_token_hash bytea, p_user_id uuid)
returns table (org_id uuid, role org_role)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  inv invitations%rowtype;
  u_email citext;
begin
  select email into u_email from users where id = p_user_id;
  select * into inv from invitations i
   where i.token_hash = p_token_hash
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
   for update;
  if not found then
    raise exception 'invitation not found or expired' using errcode = 'P0002';
  end if;
  if inv.email <> u_email then
    raise exception 'invitation was sent to a different email' using errcode = '42501';
  end if;
  insert into memberships (org_id, user_id, role) values (inv.org_id, p_user_id, inv.role)
    on conflict (org_id, user_id) do nothing;
  update invitations set accepted_at = now(), accepted_by = p_user_id where id = inv.id;
  insert into audit_log (org_id, user_id, action, entity, entity_id, data)
    values (inv.org_id, p_user_id, 'member.join', 'membership', p_user_id::text,
            jsonb_build_object('role', inv.role, 'invitation_id', inv.id));
  return query select inv.org_id, inv.role;
end $$;
revoke all on function accept_invitation(bytea, uuid) from public;

-- Preview an invitation (org name, role, email) by token, for the accept page.
create or replace function invitation_preview(p_token_hash bytea)
returns table (org_name text, role org_role, email citext, expires_at timestamptz)
language sql security definer set search_path = public, pg_temp as $$
  select o.name, i.role, i.email, i.expires_at
    from invitations i join organizations o on o.id = i.org_id
   where i.token_hash = p_token_hash
     and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
$$;
revoke all on function invitation_preview(bytea) from public;
