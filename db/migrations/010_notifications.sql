-- 010: in-app notifications, email digest opt-in, UPI ID for payment reminders.

create table notifications (
  id         bigserial primary key,
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,   -- recipient
  kind       text not null check (kind in ('voucher_cancelled', 'low_stock', 'member_joined', 'daily_summary', 'reminder_sent')),
  title      text not null check (length(title) <= 200),
  body       text not null default '' check (length(body) <= 2000),
  link       text check (link is null or link ~ '^/[A-Za-z0-9/_\-?=&.]*$'),  -- in-app path only
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index notifications_inbox_idx on notifications(org_id, user_id, created_at desc);
create index notifications_unread_idx on notifications(org_id, user_id) where read_at is null;

alter table notifications enable row level security;
alter table notifications force row level security;
-- Recipients see and mark only their own notifications, inside the current business.
create policy notifications_read on notifications for select
  using (org_id = app_org_id() and user_id = app_user_id());
create policy notifications_mark on notifications for update
  using (org_id = app_org_id() and user_id = app_user_id()) with check (org_id = app_org_id() and user_id = app_user_id());
-- Any member's action may notify other members of the same business.
create policy notifications_insert on notifications for insert with check (org_id = app_org_id());
create policy owner_definer on notifications for all to shop_owner using (true) with check (true);

grant select, insert on notifications to shop_app;
grant update (read_at) on notifications to shop_app;
grant usage, select on sequence notifications_id_seq to shop_app;

alter table memberships add column notify_email boolean not null default false;  -- daily summary by email
alter table organizations add column upi_id text check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$');

-- Joining a business notifies its owners and admins (runs inside accept_invitation).
create or replace function accept_invitation(p_token_hash bytea, p_user_id uuid)
returns table (org_id uuid, role org_role)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  inv invitations%rowtype;
  u_email citext;
  u_name text;
begin
  select email, name into u_email, u_name from users where id = p_user_id;
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
  insert into notifications (org_id, user_id, kind, title, body, link)
    select inv.org_id, m.user_id, 'member_joined', left(u_name || ' joined as ' || inv.role, 200), u_email::text, '/team'
      from memberships m where m.org_id = inv.org_id and m.role in ('owner', 'admin') and m.user_id <> p_user_id;
  return query select inv.org_id, inv.role;
end $$;
revoke all on function accept_invitation(bytea, uuid) from public;
grant execute on function accept_invitation(bytea, uuid) to shop_app;

-- For the daily-summary job only: every business with one owner to act as (no data besides ids).
create or replace function job_org_owners()
returns table (org_id uuid, owner_id uuid)
language sql security definer set search_path = public, pg_temp as $$
  select distinct on (m.org_id) m.org_id, m.user_id from memberships m where m.role = 'owner' order by m.org_id, m.created_at
$$;
revoke all on function job_org_owners() from public;
grant execute on function job_org_owners() to shop_app;

-- Housekeeping: delete notifications older than 90 days.
create or replace function purge_old_notifications() returns integer
language sql security definer set search_path = public, pg_temp as $$
  with d as (delete from notifications where created_at < now() - interval '90 days' returning 1) select count(*)::int from d
$$;
revoke all on function purge_old_notifications() from public;
grant execute on function purge_old_notifications() to shop_app;
