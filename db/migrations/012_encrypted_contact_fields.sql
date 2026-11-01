-- 012: contact fields are stored encrypted (lib/crypto.js); ciphertext is longer than the plain text,
-- so the length limits move to the API (zod) and the columns get a generous cap.
alter table ledgers drop constraint ledgers_phone_check;
alter table ledgers drop constraint ledgers_email_check;
alter table ledgers drop constraint ledgers_address_check;
alter table ledgers add constraint ledgers_contact_len check (length(phone) <= 2000 and length(email) <= 2000 and length(address) <= 4000);
alter table organizations drop constraint organizations_phone_check;
alter table organizations drop constraint organizations_email_check;
alter table organizations drop constraint organizations_address_check;
alter table organizations add constraint organizations_contact_len check (length(phone) <= 2000 and length(email) <= 2000 and length(address) <= 4000);
