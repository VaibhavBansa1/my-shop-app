// Prometheus metrics (scrape GET /api/metrics with Authorization: Bearer $METRICS_TOKEN).
// Route labels use the route *pattern* (e.g. /api/v1/orgs/:id/vouchers), never ids, to keep cardinality low.
import client from 'prom-client';

const g = globalThis;
if (!g.__shopMetrics) {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry, prefix: 'myshop_' });
  g.__shopMetrics = {
    registry,
    httpDuration: new client.Histogram({ name: 'myshop_http_request_duration_seconds', help: 'API request duration',
      labelNames: ['method', 'route', 'status'], buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 15], registers: [registry] }),
    events: new client.Counter({ name: 'myshop_events_total', help: 'Business and security events', labelNames: ['event'], registers: [registry] }),
    jobs: new client.Counter({ name: 'myshop_jobs_total', help: 'Background jobs by name and result', labelNames: ['job', 'result'], registers: [registry] }),
    cache: new client.Counter({ name: 'myshop_cache_total', help: 'Report cache hits/misses', labelNames: ['result'], registers: [registry] }),
    dbPool: new client.Gauge({ name: 'myshop_db_pool_clients', help: 'Postgres pool clients', labelNames: ['state'], registers: [registry] }),
  };
}
export const metrics = g.__shopMetrics;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
export const routePattern = (pathname) => pathname.replace(UUID, ':id').replace(/\/\d+(?=\/|$)/g, '/:n');

export function countEvent(event) { metrics.events.inc({ event }); }
