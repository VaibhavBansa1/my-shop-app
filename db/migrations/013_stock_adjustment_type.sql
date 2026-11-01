-- 013: new voucher type for stock adjustments (damage, loss, physical count). Added on its own because
-- a new enum value cannot be used in the same transaction that creates it.
alter type voucher_type add value if not exists 'stock_adjustment';
