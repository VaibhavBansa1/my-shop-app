-- db/roles.sql — run ONCE per Postgres server as a superuser, before migrations.
--   psql "$SUPERUSER_URL" -v owner_pw="'...'" -v app_pw="'...'" -v db=shop_dev -f db/roles.sql
-- shop_owner: owns the schema and runs migrations (DATABASE_OWNER_URL).
-- shop_app:   used by the running app (DATABASE_URL). Not owner, no BYPASSRLS.
select format('create role shop_owner login password %s', :'owner_pw')
  where not exists (select 1 from pg_roles where rolname = 'shop_owner') \gexec
select format('create role shop_app login password %s nobypassrls', :'app_pw')
  where not exists (select 1 from pg_roles where rolname = 'shop_app') \gexec
select format('create database %I owner shop_owner', :'db')
  where not exists (select 1 from pg_database where datname = :'db') \gexec
