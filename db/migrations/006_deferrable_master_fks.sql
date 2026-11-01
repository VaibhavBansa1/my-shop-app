-- 006: deleting an organization cascades to its vouchers and to its masters in the
-- same statement. NO ACTION foreign keys from entries/items to ledgers/items could
-- fire before the referencing rows were gone. Check them at commit instead.
alter table voucher_entries alter constraint voucher_entries_org_id_ledger_id_fkey deferrable initially deferred;
alter table voucher_items   alter constraint voucher_items_org_id_stock_item_id_fkey deferrable initially deferred;
alter table vouchers        alter constraint vouchers_org_id_party_ledger_id_fkey deferrable initially deferred;
alter table ledgers         alter constraint ledgers_org_id_group_id_fkey deferrable initially deferred;
alter table account_groups  alter constraint account_groups_org_id_parent_id_fkey deferrable initially deferred;
alter table stock_items     alter constraint stock_items_org_id_unit_id_fkey deferrable initially deferred;

-- Masters are deactivated, never deleted, by the app. Least privilege: no DELETE.
revoke delete on account_groups, ledgers, units, stock_items from shop_app;
