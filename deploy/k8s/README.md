# Kubernetes

Manifests for a production cluster (kustomize). Postgres and Redis are expected as **managed services**
(Cloud SQL / RDS / Azure Database, Memorystore / ElastiCache / Upstash) — easier backups and failover than
running them in the cluster.

```
namespace (restricted pod security) · configmap · serviceaccount (no API token)
migrate Job ──► web Deployment (2–10 pods, HPA, PDB, probes) ◄── Ingress (TLS)
             └► worker Deployment (queue + schedules)       NetworkPolicies
```

## Deploy
1. Build and push the image (`docker build -t ghcr.io/your-org/myshop:0.3.0 . && docker push …`); set it in
   `kustomization.yaml`.
2. Database once: create roles and database with `db/roles.sql` as an admin user.
3. Secret (never commit it):
```bash
kubectl create namespace myshop
```
```bash
kubectl -n myshop create secret generic myshop-secrets --from-env-file=.env.production
```
4. Edit `configmap.yaml` (APP_ORIGIN) and `ingress.yaml` (host), then:
```bash
kubectl apply -k deploy/k8s
```
```bash
kubectl -n myshop wait --for=condition=complete job/myshop-migrate --timeout=300s
```
For every new version: delete the old `myshop-migrate` job, apply again, wait for it, then the web/worker
roll out with zero downtime (`maxUnavailable: 0`, readiness on `/api/ready`).

## What is in place
- Non-root, read-only root filesystem, all Linux capabilities dropped, seccomp, no service-account token.
- Web pods never get the migration credentials (`DATABASE_OWNER_URL` blanked).
- Probes: startup/liveness `/api/health`, readiness `/api/ready` (DB + Redis); worker `/healthz`.
- Autoscaling on CPU (2–10 web pods); disruption budget keeps one pod up during node maintenance.
- Prometheus annotations; metrics need `METRICS_TOKEN` (bearer).
- Scale the worker freely: jobs are locked per worker and daily schedules run once.

## Sizing (starting point)
Web pod: 250m CPU / 384 MiB request, 1 GiB limit (OCR peaks). Worker: 100m / 192 MiB. Postgres: 2 vCPU /
4 GB handles thousands of small shops (see docs/PERFORMANCE.md). Use PgBouncer (transaction mode) when
pods × `DB_POOL_MAX` approaches Postgres `max_connections` — our `SET LOCAL` design is compatible.
