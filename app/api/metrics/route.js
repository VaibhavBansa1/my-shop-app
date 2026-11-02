// Prometheus scrape endpoint. Disabled unless METRICS_TOKEN is set; requires Authorization: Bearer <token>.
import { timingSafeEqual } from 'node:crypto';
import { metrics } from '../../../lib/metrics.js';
import { getPool } from '../../../lib/db.js';

export const dynamic = 'force-dynamic';
export async function GET(request) {
  const token = process.env.METRICS_TOKEN;
  const got = Buffer.from(request.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${token}`);
  if (!token || got.length !== want.length || !timingSafeEqual(got, want)) return new Response('not found', { status: 404 });
  const p = getPool();
  metrics.dbPool.set({ state: 'total' }, p.totalCount);
  metrics.dbPool.set({ state: 'idle' }, p.idleCount);
  metrics.dbPool.set({ state: 'waiting' }, p.waitingCount);
  return new Response(await metrics.registry.metrics(), { headers: { 'content-type': metrics.registry.contentType, 'cache-control': 'no-store' } });
}
