// Report cache. Keys include the business's data_version (bumped by triggers on every change to vouchers,
// ledgers or items) and today's date, so a cached report is never stale. Redis when available
// (shared by all processes), otherwise a small in-process LRU.
import { createHash } from 'node:crypto';
import { withOrg } from './db.js';
import { withRedis } from './redis.js';
import { metrics } from './metrics.js';

const TTL_SECONDS = 600;
const MAX_LOCAL = 500;
const local = new Map();

function localGet(k) {
  const e = local.get(k);
  if (!e || e.exp < Date.now()) { local.delete(k); return undefined; }
  local.delete(k); local.set(k, e); // LRU touch
  return e.v;
}
function localSet(k, v) {
  local.set(k, { v, exp: Date.now() + TTL_SECONDS * 1000 });
  while (local.size > MAX_LOCAL) local.delete(local.keys().next().value);
}

export async function cachedReport(db, name, params, compute) {
  if (process.env.REPORT_CACHE === 'off') return compute();
  const version = await withOrg(db, async (c) => (await c.query('select data_version from organizations where id = $1', [db.orgId])).rows[0]?.data_version);
  const day = new Date().toISOString().slice(0, 10);
  const key = `rep:${db.orgId}:${version}:${day}:${name}:${createHash('sha1').update(JSON.stringify(params ?? {})).digest('hex')}`;
  const hit = (await withRedis(async (r) => { const v = await r.get(key); return v ? JSON.parse(v) : null; })) ?? localGet(key);
  if (hit) { metrics.cache.inc({ result: 'hit' }); return hit; }
  metrics.cache.inc({ result: 'miss' });
  const value = await compute();
  localSet(key, value);
  await withRedis((r) => r.set(key, JSON.stringify(value), 'EX', TTL_SECONDS));
  return value;
}

export function clearLocalCache() { local.clear(); }
