-- 021: hardening from security review round 2 (docs/SECURITY_FINDINGS.md).

-- F-17: delete_image() only deletes an image that is still unused and old, checked at delete time.
-- Before, it deleted any id it was given (callable by the app role). Returns true when a row was deleted,
-- so the cleanup job deletes the files only after the row is gone.
drop function if exists delete_image(uuid);
create function delete_image(p_id uuid, p_older_than interval default interval '1 day') returns boolean
language sql security definer set search_path = public, pg_temp as $$
  with d as (
    delete from images i
     where i.id = p_id
       and i.created_at < now() - p_older_than
       and not exists (select 1 from stock_items s where s.org_id = i.org_id and s.image_id = i.id)
       and not exists (select 1 from organizations o where o.id = i.org_id and o.logo_image_id = i.id)
    returning 1)
  select exists (select 1 from d)
$$;
revoke all on function delete_image(uuid, interval) from public;
grant execute on function delete_image(uuid, interval) to shop_app;

-- F-19: lines cannot be added to a voucher after the transaction that created it. Vouchers are append-only;
-- the app never does this, the database now refuses it too (defence in depth).
create or replace function voucher_lines_same_tx() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from vouchers v where v.id = new.voucher_id and v.xmin::text::bigint = (txid_current() % 4294967296)) then
    raise exception 'voucher lines can only be added when the voucher is created' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists voucher_entries_same_tx on voucher_entries;
create trigger voucher_entries_same_tx before insert on voucher_entries for each row execute function voucher_lines_same_tx();
drop trigger if exists voucher_items_same_tx on voucher_items;
create trigger voucher_items_same_tx before insert on voucher_items for each row execute function voucher_lines_same_tx();
