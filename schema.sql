create extension if not exists pgcrypto;

create table if not exists products (
  id uuid primary key,
  name text not null,
  category text not null,
  sku text not null unique,
  cost numeric(12,2) not null default 0,
  price numeric(12,2) not null default 0,
  stock integer not null default 0,
  min_stock integer not null default 0,
  supplier text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists purchases (
  id uuid primary key,
  date timestamptz not null default now(),
  product_id uuid not null references products(id) on delete cascade,
  quantity integer not null,
  cost numeric(12,2) not null,
  reference text not null default '',
  notes text not null default ''
);

create table if not exists sales (
  id uuid primary key,
  date timestamptz not null default now(),
  product_id uuid not null references products(id) on delete cascade,
  quantity integer not null,
  price numeric(12,2) not null,
  channel text not null default '',
  notes text not null default ''
);

create table if not exists adjustments (
  id uuid primary key,
  date timestamptz not null default now(),
  product_id uuid not null references products(id) on delete cascade,
  delta integer not null,
  reason text not null,
  notes text not null default ''
);

create table if not exists expenses (
  id uuid primary key,
  date timestamptz not null default now(),
  label text not null,
  category text not null,
  amount numeric(12,2) not null,
  notes text not null default ''
);
