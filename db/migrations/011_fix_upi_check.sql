-- 011: Postgres regex repetition counts are limited to 255; use a realistic UPI handle length.
alter table organizations drop constraint organizations_upi_id_check;
alter table organizations add constraint organizations_upi_id_check
  check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,63}$');
