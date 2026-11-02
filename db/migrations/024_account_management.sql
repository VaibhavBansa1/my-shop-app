-- 024: account settings: email change with confirmation, and account deletion.

create table email_changes (
  token_hash  bytea primary key,                 -- sha256 of the token emailed to the NEW address
  user_id     uuid not null references users(id) on delete cascade,
  new_email   citext not null check (length(new_email) between 3 and 254),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index email_changes_user_idx on email_changes(user_id);
grant select, insert, update, delete on email_changes to shop_app;

-- Deleted accounts keep their row (bills and the activity log of businesses still point to it, and accounting
-- records must be kept), but every personal detail is wiped and the person can never sign in again.
alter table users add column deleted_at timestamptz;

-- Businesses where this person is the ONLY owner (they must delete them or make someone else owner first).
create or replace function sole_owner_orgs() returns table (org_id uuid, name text)
language sql security definer set search_path = public, pg_temp as $$
  select o.id, o.name from organizations o
   where exists (select 1 from memberships m where m.org_id = o.id and m.user_id = app_user_id() and m.role = 'owner')
     and (select count(*) from memberships m where m.org_id = o.id and m.role = 'owner') = 1
$$;
-- Leave every business (memberships are per business under row-level security, so this needs the owner role).
create or replace function leave_all_orgs() returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  if app_user_id() is null then raise exception 'no user' using errcode = '42501'; end if;
  if exists (select 1 from sole_owner_orgs()) then
    raise exception 'still the only owner of a business' using errcode = 'P0001';
  end if;
  delete from memberships where user_id = app_user_id();
  get diagnostics n = row_count;
  delete from notifications where user_id = app_user_id();
  return n;
end $$;
-- Both act only on the signed-in person (app_user_id(), set by withOrg), never on an id passed in.
revoke all on function sole_owner_orgs(), leave_all_orgs() from public;
grant execute on function sole_owner_orgs(), leave_all_orgs() to shop_app;
