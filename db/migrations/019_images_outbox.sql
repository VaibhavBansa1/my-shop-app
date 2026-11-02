-- 019: images (item photos, business logo) and the transactional outbox for Kafka events.

create table images (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  kind       text not null check (kind in ('item', 'logo')),
  hash       text not null check (hash ~ '^[0-9a-f]{64}$'),          -- sha256 of the uploaded file (dedupe)
  width      integer not null check (width > 0),
  height     integer not null check (height > 0),
  bytes      integer not null check (bytes > 0),
  variants   jsonb not null,                                       -- {"thumb": {"key","w","h","bytes"}, ...}
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, kind, hash)
);
alter table images enable row level security;
alter table images force row level security;
create policy tenant_isolation on images for all using (org_id = app_org_id()) with check (org_id = app_org_id());
create policy owner_definer on images for all to shop_owner using (true) with check (true);
grant select, insert, delete on images to shop_app;

alter table stock_items add column image_id uuid;
alter table stock_items add constraint stock_items_image_fk foreign key (org_id, image_id) references images(org_id, id);
alter table organizations add column logo_image_id uuid;
alter table organizations add constraint organizations_logo_fk foreign key (id, logo_image_id) references images(org_id, id);

-- Outbox: events are written in the SAME transaction as the change, then published to Kafka by the
-- worker. Nothing is published for a rolled-back change, and nothing is lost if Kafka is down.
create table outbox (
  id           bigserial primary key,
  org_id       uuid not null,
  topic        text not null check (topic ~ '^[a-z0-9._-]{1,100}$'),
  type         text not null check (type ~ '^[a-z_.]{2,60}$'),
  key          text not null,
  payload      jsonb not null,
  created_at   timestamptz not null default now(),
  published_at timestamptz,
  attempts     integer not null default 0,
  last_error   text
);
create index outbox_pending_idx on outbox(id) where published_at is null;
grant select, insert, update, delete on outbox to shop_app;
grant usage, select on sequence outbox_id_seq to shop_app;

-- Images no longer referenced by an item or a logo (for the cleanup job; owner-defined, all businesses).
create or replace function orphan_images(p_older_than interval) returns table (id uuid, org_id uuid, variants jsonb)
language sql security definer set search_path = public, pg_temp as $$
  select i.id, i.org_id, i.variants from images i
   where i.created_at < now() - p_older_than
     and not exists (select 1 from stock_items s where s.org_id = i.org_id and s.image_id = i.id)
     and not exists (select 1 from organizations o where o.id = i.org_id and o.logo_image_id = i.id)
$$;
create or replace function delete_image(p_id uuid) returns void
language sql security definer set search_path = public, pg_temp as $$ delete from images where id = p_id $$;
revoke all on function orphan_images(interval), delete_image(uuid) from public;
grant execute on function orphan_images(interval), delete_image(uuid) to shop_app;
