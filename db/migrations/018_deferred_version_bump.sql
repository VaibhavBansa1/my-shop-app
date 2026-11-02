-- 018: bump the report-cache version at COMMIT (deferred constraint trigger) instead of at insert time.
-- An immediate bump held a lock on the business row for the whole voucher transaction, so parallel
-- bills in one business waited for each other. At commit the lock lasts microseconds.
drop trigger vouchers_bump on vouchers;
drop trigger ledgers_bump on ledgers;
drop trigger stock_items_bump on stock_items;
create constraint trigger vouchers_bump after insert or update on vouchers
  deferrable initially deferred for each row execute function bump_org_version();
create constraint trigger ledgers_bump after insert or update on ledgers
  deferrable initially deferred for each row execute function bump_org_version();
create constraint trigger stock_items_bump after insert or update on stock_items
  deferrable initially deferred for each row execute function bump_org_version();
