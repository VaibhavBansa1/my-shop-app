// Database access. The app connects as the least-privileged `shop_app` role.
// Anything that touches organization data MUST go through withOrg(), which sets
// the RLS context with SET LOCAL inside a transaction (see docs/adr/0001).
import pg from 'pg';

// numeric -> string (default), keep it; bigint (int8) -> string; date -> 'YYYY-MM-DD' string.
pg.types.setTypeParser(1082, (v) => v);

const globalForPool = globalThis;

export function getPool() {
  if (!globalForPool.__shopPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    globalForPool.__shopPool = new pg.Pool({
      connectionString,
      max: Number(process.env.DB_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
      application_name: 'my-shop-app',
    });
  }
  return globalForPool.__shopPool;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** Run fn(client) in a transaction with no tenant context (auth tables only). */
export async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run fn(client) in a transaction with RLS context set.
 * @param {{userId: string, orgId?: string|null}} ctx
 */
export async function withOrg(ctx, fn) {
  if (!isUuid(ctx.userId)) throw new Error('withOrg: invalid userId');
  if (ctx.orgId != null && !isUuid(ctx.orgId)) throw new Error('withOrg: invalid orgId');
  return tx(async (client) => {
    // set_config(..., true) == SET LOCAL: reset at end of transaction, never leaks via the pool.
    await client.query(
      "select set_config('app.user_id', $1, true), set_config('app.org_id', $2, true)",
      [ctx.userId, ctx.orgId ?? ''],
    );
    return fn(client);
  });
}

/** Map Postgres errors to app errors where meaningful. */
export function pgErrorCode(err) {
  return err && typeof err === 'object' ? err.code : undefined;
}
