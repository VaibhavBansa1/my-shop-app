-- 003_grants.sql — least-privilege grants for the runtime role shop_app.
-- The role itself is created once per server by db/roles.sql (needs a superuser).
-- Vouchers, entries, items and the audit log are append-only for the app:
-- no DELETE, and on vouchers UPDATE only on the cancellation columns.

grant usage on schema public to shop_app;

grant select, insert, update, delete on users, sessions, login_attempts to shop_app;
grant usage, select on sequence login_attempts_id_seq to shop_app;

grant select, insert, update, delete on organizations, memberships, invitations,
  account_groups, ledgers, units, stock_items to shop_app;

grant select, insert, update on voucher_sequences to shop_app;
grant select, insert on vouchers, voucher_entries, voucher_items, audit_log to shop_app;
grant update (status, cancelled_at, cancelled_by, cancel_reason) on vouchers to shop_app;
grant usage, select on sequence voucher_entries_id_seq, voucher_items_id_seq, audit_log_id_seq to shop_app;

grant execute on function app_org_id(), app_user_id(), seed_organization(uuid) to shop_app;
grant execute on function accept_invitation(bytea, uuid), invitation_preview(bytea) to shop_app;
