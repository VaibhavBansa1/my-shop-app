-- 014: stock adjustments move quantity only — no ledger entries (their money effect appears through
-- closing-stock value in P&L, like Tally). Every other voucher must still balance with >= 2 entries.
create or replace function check_voucher_balanced() returns trigger
language plpgsql as $$
declare
  v_id uuid;
  v_type voucher_type;
  v_sum numeric;
  v_count int;
  v_items int;
begin
  if tg_table_name = 'vouchers' then
    v_id := new.id;
  elsif tg_op = 'DELETE' then
    v_id := old.voucher_id;
  else
    v_id := new.voucher_id;
  end if;
  select type into v_type from vouchers where id = v_id;
  if not found then
    return null;  -- voucher deleted together with its lines (organization deletion)
  end if;
  select coalesce(sum(amount), 0), count(*) into v_sum, v_count from voucher_entries where voucher_id = v_id;
  if v_type = 'stock_adjustment' then
    select count(*) into v_items from voucher_items where voucher_id = v_id;
    if v_count <> 0 or v_items < 1 then
      raise exception 'stock adjustment % must have item lines and no ledger entries', v_id using errcode = '23514';
    end if;
  elsif v_sum <> 0 or v_count < 2 then
    raise exception 'voucher % is not balanced (sum %, entries %)', v_id, v_sum, v_count using errcode = '23514';
  end if;
  return null;
end $$;
