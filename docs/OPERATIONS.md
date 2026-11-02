# Operations: telemetry, feature flags, security logging, Redis, queue, Docker, Kubernetes

Everything here is **optional**. A single shop can run `npm start` with Postgres only. Add pieces as you grow.

## Do we need Redis / Kubernetes? (decision)
| Size | Recommended setup |
|---|---|
| 1 shop / family | One server: `docker compose -f docker-compose.prod.yml up -d` (Postgres + Redis + web + worker on one VM), or even Postgres + `npm start` |
| 10–1,000 shops | Same compose stack on a 2–4 vCPU VM + managed Postgres with backups. Redis on. |
| 1,000+ shops / high availability | Kubernetes (`deploy/k8s`), managed Postgres + managed Redis, 2–10 web pods, 1–3 workers |

Measured capacity is in [PERFORMANCE.md](PERFORMANCE.md). Postgres is the real limit; the app is stateless and scales sideways.

## Telemetry
- **Logs:** one JSON object per line on stdout/stderr (`ts, level, msg, requestId, route, status, ms, userId, orgId`).
  `LOG_LEVEL=debug|info|warn|error`. Requests slower than `SLOW_REQUEST_MS` (default 2000) are logged as
  warnings; `LOG_REQUESTS=1` logs every request. Secrets, passwords, tokens and bodies are never logged.
- **Request id:** every API response has `x-request-id`; error responses include it, so a user can quote it.
- **Metrics (Prometheus):** `GET /api/metrics` with `Authorization: Bearer $METRICS_TOKEN` (404 without).
  Worker: `:9091/metrics`. Series:
  `myshop_http_request_duration_seconds{method,route,status}` (route patterns, never ids),
  `myshop_events_total{event}` (security events), `myshop_jobs_total{job,result}`,
  `myshop_cache_total{result}`, `myshop_db_pool_clients{state}`, plus Node process metrics.
- **Health:** `/api/health` (liveness: database), `/api/ready` (readiness: database + migrations + Redis),
  worker `/healthz`.
- Suggested alerts: 5xx rate > 1% for 5 min; p95 latency > 1 s; `myshop_jobs_total{result="error"}` rising;
  `myshop_events_total{event="login.failure"}` spike (password guessing); readiness failing.

## Feature flags
Switch features on/off without deploying: `ocr`, `ai`, `reminders`, `import`, `daily_summary`.
```bash
npm run flags
```
```bash
npm run flags -- off ocr
```
Also: `rollout <key> <percent>` (stable per business), `allow <key> <orgId>`, `deny <key> <orgId>`,
`add <key> "description"`. Emergency override per server: `FLAG_OCR=off` in the environment.
Changes apply within 30 s. The UI hides features that are off; the API answers 404 for them.

## Security logging and audit
- **Activity log (per business):** every create/update/cancel/import/export, readable by admins in Settings.
- **Security log (per person):** sign-in success/failure/throttling, sign-up, sign-out, password change and
  reset, email confirmation, device sign-outs, permission denials, rate limits, role changes, removals,
  backup downloads, business deletion — with time, IP (when `TRUST_PROXY=1`), device and request id.
  People see their own history in **Settings → Security**, and can sign out any device.
- The app can only add to the security log, never edit or delete it; entries older than
  `SECURITY_LOG_RETENTION_DAYS` (default 365, minimum 30) are purged by the daily cleanup job.
- Set `SECURITY_LOG_STDOUT=1` to also stream security events to your log system (SIEM).
- Operators can query everything with the owner role, e.g. failed logins in the last hour:
  `select ip, count(*) from security_events where event='login.failure' and at > now()-interval '1 hour' group by 1 order by 2 desc;`

## Redis (optional, `REDIS_URL`)
Used for: rate limits (sliding windows shared by all processes), the report cache, the flag cache, and the
BullMQ job queue. Without Redis: rate limits in Postgres, report cache per process, queue in Postgres.
If Redis goes down the app keeps working on the fallbacks (logged as warnings).
Use `noeviction` and persistence (AOF) so queued jobs survive restarts (the compose file does this).

## Background jobs (`npm run worker`)
| Job | When | What |
|---|---|---|
| `email.send` | on demand (`EMAIL_VIA_QUEUE=1`) | sign-up confirmations, resets, invitations, welcomes — sign-up never waits on a slow mail server |
| `daily_summary.run` | 08:30 (`DAILY_SUMMARY_CRON`, `SCHEDULE_TZ`, default Asia/Kolkata) | daily summary notifications/emails |
| `cleanup.run` | 03:15 | expired sessions, old attempts, finished jobs, old notifications, old security events |

Retries with exponential backoff (5 attempts). Postgres-mode payloads are encrypted and wiped after success.
Run 1–3 workers; jobs are locked so nothing runs twice. Only set `EMAIL_VIA_QUEUE=1` when a worker runs.

## Report cache
Reports and the dashboard are cached per business. The cache key includes a version number that the
database increments when the business's vouchers, ledgers or items change (at commit), so cached reports
are never stale. `REPORT_CACHE=off` disables it.

## Docker
```bash
docker build -t myshop .
```
One image runs everything: web (`node server.js`), worker (`node scripts/worker.mjs`), migrations
(`node scripts/migrate.mjs`). Non-root (uid 10001), works with a read-only root filesystem, built-in
healthcheck, ~285 MB. Behind a TLS-inspecting proxy add `--secret id=ca,src=/path/ca.crt`.

Full stack on one machine (Postgres, Redis, migrate, web, worker):
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```
`.env.production` needs `POSTGRES_PASSWORD`, `OWNER_DB_PASSWORD`, `APP_DB_PASSWORD`, `DATA_ENCRYPTION_KEY`,
`APP_ORIGIN`, email settings and (optionally) `METRICS_TOKEN`. Put HTTPS in front (Caddy is the simplest).

## Kubernetes
See [deploy/k8s/README.md](../deploy/k8s/README.md): namespace with restricted pod security, migrate Job,
web Deployment (2–10 pods with HPA, PDB, probes, topology spread), worker Deployment, Ingress with TLS,
NetworkPolicies, no service-account token, read-only root filesystem, all capabilities dropped.

## Backups and restore (whatever the setup)
- Managed Postgres with point-in-time recovery, or `pg_dump` nightly to another location.
- Keep `DATA_ENCRYPTION_KEY` in a password manager — backups are useless for contact fields without it.
- Test a restore every few months into a scratch database and open the app against it.
