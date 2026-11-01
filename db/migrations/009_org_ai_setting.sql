-- 009: per-business opt-in for AI features (off by default).
alter table organizations add column ai_enabled boolean not null default false;
