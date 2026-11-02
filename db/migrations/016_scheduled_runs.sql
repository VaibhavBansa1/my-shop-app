-- 016: make each scheduled job run once per period even with several workers (Postgres queue mode).
create table scheduled_runs (
  name   text not null,
  period text not null,               -- e.g. '2026-11-02' for daily jobs
  at     timestamptz not null default now(),
  primary key (name, period)
);
grant select, insert, delete on scheduled_runs to shop_app;
