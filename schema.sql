create extension if not exists pgcrypto;

create table if not exists products (
  id uuid primary key,
  name text not null,
  category text not null,
  sku text not null unique,
  cost numeric(12,2) not null default 0,
  price numeric(12,2) not null default 0,
  gst_rate numeric(5,2) not null default 0,
  hsn_code text not null default '',
  stock integer not null default 0,
  min_stock integer not null default 0,
  supplier text not null default '',
  created_at timestamptz not null default now()
);

alter table products add column if not exists gst_rate numeric(5,2) not null default 0;
alter table products add column if not exists hsn_code text not null default '';

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

create table if not exists invoices (
  id uuid primary key,
  invoice_number text not null unique,
  invoice_date timestamptz not null default now(),
  customer_name text not null default '',
  customer_phone text not null default '',
  customer_gstin text not null default '',
  payment_mode text not null default '',
  source text not null default 'manual',
  place_of_supply_code text not null default 'MH',
  is_interstate boolean not null default false,
  subtotal numeric(12,2) not null default 0,
  cgst_amount numeric(12,2) not null default 0,
  sgst_amount numeric(12,2) not null default 0,
  igst_amount numeric(12,2) not null default 0,
  total_tax numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists invoice_items (
  id uuid primary key,
  invoice_id uuid not null references invoices(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  product_name text not null,
  hsn_code text not null default '',
  quantity integer not null,
  rate numeric(12,2) not null,
  gst_rate numeric(5,2) not null default 0,
  taxable_amount numeric(12,2) not null default 0,
  cgst_amount numeric(12,2) not null default 0,
  sgst_amount numeric(12,2) not null default 0,
  igst_amount numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0
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
