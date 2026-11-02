-- 017: the app may not delete security events; retention is enforced by this narrow function only.
create or replace function purge_old_security_events(p_days integer) returns integer
language sql security definer set search_path = public, pg_temp as $$
  with d as (delete from security_events where at < now() - make_interval(days => greatest(p_days, 30)) returning 1)
  select count(*)::int from d
$$;
revoke all on function purge_old_security_events(integer) from public;
grant execute on function purge_old_security_events(integer) to shop_app;
