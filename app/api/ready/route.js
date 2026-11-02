// Readiness: database reachable and migrations applied; Redis reachable when configured.
// (Liveness is /api/health, which only checks the database.)
import { getPool } from '../../../lib/db.js';
import { redis } from '../../../lib/redis.js';

export const dynamic = 'force-dynamic';
export async function GET() {
  const checks = {};
  try { await getPool().query('select 1 from feature_flags limit 1'); checks.database = 'ok'; } catch { checks.database = 'fail'; }
  if (process.env.REDIS_URL) {
    try {
      const r = redis();
      const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
      if (r.status !== 'ready') await Promise.race([new Promise((res) => r.once('ready', res)), timeout(2000)]); // first check after start
      checks.redis = (await Promise.race([r.ping(), timeout(1000)])) === 'PONG' ? 'ok' : 'fail';
    }
    catch { checks.redis = 'fail'; }
  }
  const ok = Object.values(checks).every((v) => v === 'ok');
  return Response.json({ ok, checks }, { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
