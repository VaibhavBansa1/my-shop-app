-- 005: accept_invitation's OUT columns (org_id, role) clashed with table columns
-- in ON CONFLICT; resolve names to columns.
create or replace function accept_invitation(p_token_hash bytea, p_user_id uuid)
returns table (org_id uuid, role org_role)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
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
grant execute on function accept_invitation(bytea, uuid) to shop_app;
