// Optional Redis (REDIS_URL). Used for rate limits, report cache, feature-flag cache and the job queue.
// Everything works without it (Postgres fallbacks); Redis makes hot paths faster across many app processes.
import { createRequire } from 'node:module';
import { log } from './log.js';

const require = createRequire(import.meta.url);
const g = globalThis;

export function redis() {
  if (!process.env.REDIS_URL) return null;
  if (!g.__shopRedis) {
    const Redis = require('ioredis');
    g.__shopRedis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: false });
    g.__shopRedis.on('error', (e) => log.warn('redis error', { error: e.message }));
  }
  return g.__shopRedis;
}

/** Run fn(redis) if Redis is up; otherwise return undefined so the caller uses its fallback. */
export async function withRedis(fn) {
  const r = redis();
  if (!r || r.status !== 'ready') return undefined;
  try { return await fn(r); } catch (e) { log.warn('redis op failed, using fallback', { error: e.message }); return undefined; }
}

/** BullMQ needs its own connections with maxRetriesPerRequest: null (blocking commands). */
export function bullConnection() {
  const Redis = require('ioredis');
  const c = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
  c.on('error', (e) => log.warn('redis (queue) error', { error: e.message }));
  return c;
}

export async function closeRedis() { if (g.__shopRedis) { await g.__shopRedis.quit().catch(() => {}); delete g.__shopRedis; } }
