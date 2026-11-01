-- 004_definer_policies.sql
-- accept_invitation() and invitation_preview() are SECURITY DEFINER functions owned
-- by shop_owner. Because RLS is FORCEd, the owner is subject to policies too, so
-- these functions could not see the invitation they need. Give the owner role
-- (used only by migrations and these two audited functions; never by the app)
-- explicit access on exactly the tables those functions touch.
create policy owner_definer on invitations   for all to shop_owner using (true) with check (true);
create policy owner_definer on memberships   for all to shop_owner using (true) with check (true);
create policy owner_definer on organizations for select to shop_owner using (true);
create policy owner_definer on audit_log     for insert to shop_owner with check (true);
