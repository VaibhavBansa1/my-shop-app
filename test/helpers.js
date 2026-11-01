// Test helpers: rebuilds the test database schema from migrations, then runs
// services as the least-privileged shop_app role (exactly like production).
import { execFileSync } from 'node:child_process';
import pg from 'pg';

export const OWNER_URL = process.env.TEST_DATABASE_OWNER_URL || 'postgres://shop_owner:shop_owner_dev@localhost:5432/shop_test';
export const APP_URL = process.env.TEST_DATABASE_URL || 'postgres://shop_app:shop_app_dev@localhost:5432/shop_test';

let ready;
export function setupDb() {
  ready ??= (async () => {
    const c = new pg.Client({ connectionString: OWNER_URL });
    await c.connect();
    await c.query('drop schema if exists public cascade; create schema public; drop table if exists schema_migrations');
    await c.end();
    execFileSync('node', ['scripts/migrate.mjs'], { env: { ...process.env, DATABASE_OWNER_URL: OWNER_URL }, stdio: 'pipe' });
    process.env.DATABASE_URL = APP_URL;
  })();
  return ready;
}

let n = 0;
export const uniqueEmail = (p = 'user') => `${p}${Date.now()}${n++}@example.com`;

export async function ownerQuery(sql, params) {
  const c = new pg.Client({ connectionString: OWNER_URL });
  await c.connect();
  try { return await c.query(sql, params); } finally { await c.end(); }
}

/** Creates a user + org quickly. Returns { user, org, db } */
export async function makeUserOrg(overrides = {}) {
  const { signup } = await import('../lib/services/accounts.js');
  const { createOrg } = await import('../lib/services/orgs.js');
  const { user } = await signup({ name: 'Test User', email: uniqueEmail(), password: 'correct horse battery' }, { ip: `t${n++}` });
  const org = await createOrg(user.id, {
    name: `Shop ${n++}`, legalName: '', gstin: '23ABCDE1234F1Z8', stateCode: '23', country: 'IN', currency: 'INR',
    address: '', phone: '', email: '', fyStartMonth: 4, booksFrom: '2026-04-01', ...overrides,
  });
  return { user, org, db: { userId: user.id, orgId: org.id } };
}

export async function closePool() {
  const { getPool } = await import('../lib/db.js');
  await getPool().end();
  delete globalThis.__shopPool;
}
