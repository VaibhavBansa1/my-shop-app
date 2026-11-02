// Feature flags: database table (operator-managed) with environment overrides, cached for 30 s.
//   FLAG_<KEY>=off|on      hard override (e.g. FLAG_OCR=off to switch OCR off everywhere instantly)
// Per business: deny list > allow list > deterministic percentage rollout (same business, same answer).
import { createHash } from 'node:crypto';
import { getPool } from './db.js';
import { withRedis } from './redis.js';

const TTL_MS = 30_000;
let cache = { at: 0, flags: null };

async function loadFlags() {
  if (cache.flags && Date.now() - cache.at < TTL_MS) return cache.flags;
  const fromRedis = await withRedis(async (r) => { const v = await r.get('flags:v1'); return v ? JSON.parse(v) : null; });
  if (fromRedis) { cache = { at: Date.now(), flags: fromRedis }; return fromRedis; }
  const { rows } = await getPool().query('select key, enabled, rollout_percent, allow_orgs, deny_orgs from feature_flags');
  const flags = Object.fromEntries(rows.map((r) => [r.key, r]));
  await withRedis((r) => r.set('flags:v1', JSON.stringify(flags), 'PX', TTL_MS));
  cache = { at: Date.now(), flags };
  return flags;
}

export function clearFlagCache() { cache = { at: 0, flags: null }; return withRedis((r) => r.del('flags:v1')); }

function bucket(key, orgId) {
  return createHash('sha256').update(`${key}:${orgId}`).digest().readUInt16BE(0) % 100;
}

/** Unknown flags are ON (features are not hidden by accident); an env override always wins. */
export async function flagEnabled(key, orgId = null) {
  const env = process.env[`FLAG_${key.toUpperCase()}`];
  if (env === 'off' || env === 'false' || env === '0') return false;
  if (env === 'on' || env === 'true' || env === '1') return true;
  const f = (await loadFlags())[key];
  if (!f) return true;
  if (!f.enabled) return false;
  if (orgId && f.deny_orgs?.includes(orgId)) return false;
  if (orgId && f.allow_orgs?.includes(orgId)) return true;
  if (f.rollout_percent >= 100) return true;
  return orgId ? bucket(key, orgId) < f.rollout_percent : false;
}

export async function flagsFor(orgId) {
  const flags = await loadFlags();
  const out = {};
  for (const k of new Set([...Object.keys(flags), 'ocr', 'ai', 'reminders', 'import', 'daily_summary'])) out[k] = await flagEnabled(k, orgId);
  return out;
}
