// Thin HTTP layer shared by every /api/v1 route: auth, CSRF origin check,
// JSON parsing with a size limit, membership/role checks and error mapping.
import { NextResponse } from 'next/server.js';
import { ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import { AppError, badRequest, forbidden, notFound, unauthorized } from './errors.js';
import { getSessionUser, SESSION_COOKIE } from './auth/session.js';
import { can } from './permissions.js';
import { getPool, isUuid, pgErrorCode } from './db.js';
import { log } from './log.js';
import { metrics, routePattern } from './metrics.js';
import { securityEvent } from './services/securityLog.js';
import { flagEnabled } from './flags.js';

const MAX_BODY_BYTES = 256 * 1024;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Public base URL for links in emails. Taken ONLY from APP_ORIGIN in production: building links from
 * the request's Host header would let an attacker send a victim a real reset email that points to
 * the attacker's site (host-header poisoning). In development, falls back to the request origin.
 */
export function publicOrigin(request) {
  const configured = process.env.APP_ORIGIN?.split(',')[0]?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') {
    throw new AppError(500, 'misconfigured', 'The server address (APP_ORIGIN) is not configured. Please contact the administrator.');
  }
  return new URL(request.url).origin;
}

export function clientIp(request) {
  if (process.env.TRUST_PROXY === '1') {
    const xff = request.headers.get('x-forwarded-for');
    if (xff) return xff.split(',')[0].trim().slice(0, 64);
    const real = request.headers.get('x-real-ip');
    if (real) return real.trim().slice(0, 64);
  }
  return 'unknown';
}

function readToken(request) {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return { token: auth.slice(7).trim(), via: 'bearer' };
  const cookie = request.cookies?.get?.(SESSION_COOKIE)?.value;
  if (cookie) return { token: cookie, via: 'cookie' };
  return { token: null, via: null };
}

function allowedOrigins(request) {
  const set = new Set();
  if (process.env.APP_ORIGIN) process.env.APP_ORIGIN.split(',').forEach((o) => set.add(o.trim()));
  const host = request.headers.get('host');
  if (host && !process.env.APP_ORIGIN) {
    set.add(`http://${host}`);
    set.add(`https://${host}`);
  }
  return set;
}

/** Browsers always send Origin on cross-site POSTs; reject cookie-authenticated writes from other sites. */
function checkCsrf(request, via) {
  if (SAFE_METHODS.has(request.method) || via === 'bearer') return;
  const origin = request.headers.get('origin');
  if (!origin || !allowedOrigins(request).has(origin)) {
    throw forbidden('Request origin not allowed.');
  }
}

/**
 * Read the request body into a Buffer, refusing more than `max` bytes. Works for chunked
 * uploads without Content-Length: it stops reading as soon as the limit is passed.
 */
export async function readBodyLimited(request, max, tooLargeMessage = 'Request body is too large.') {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > max) throw badRequest(tooLargeMessage);
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      throw badRequest(tooLargeMessage);
    }
    chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  }
  return Buffer.concat(chunks, size);
}

/** JSON.parse that refuses NUL characters inside any string value. */
export function parseJsonStrict(text) {
  let hasNul = false;
  let parsed;
  try {
    parsed = text ? JSON.parse(text, (k, v) => { if (typeof v === 'string' && v.includes('\u0000')) hasNul = true; return v; }) : {};
  } catch {
    throw badRequest('Request body is not valid JSON.');
  }
  if (hasNul) throw badRequest('Text may not contain NUL characters.');
  return parsed;
}

export async function readJson(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.toLowerCase().startsWith('application/json')) throw badRequest('Content-Type must be application/json.');
  const text = (await readBodyLimited(request, MAX_BODY_BYTES)).toString('utf8');
  return parseJsonStrict(text);
}

export function json(data, status = 200, headers = {}) {
  return NextResponse.json(data, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

function errorResponse(err, requestId) {
  if (err instanceof AppError) {
    return json({ error: { code: err.code, message: err.message, details: err.details } }, err.status,
      err.retryAfter ? { 'retry-after': String(err.retryAfter) } : {});
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return json({ error: { code: 'validation_failed', message: details[0]?.message ?? 'Invalid input.', details } }, 422);
  }
  if (err instanceof RangeError) {
    return json({ error: { code: 'validation_failed', message: err.message } }, 422);
  }
  const code = pgErrorCode(err);
  if (code === '23505') return json({ error: { code: 'conflict', message: 'That name or number is already in use.' } }, 409);
  if (code === '23503') return json({ error: { code: 'validation_failed', message: 'A referenced record does not exist.' } }, 422);
  if (code === '23514' || code === '22P02' || code === '22003') {
    return json({ error: { code: 'validation_failed', message: 'Some values are not allowed.' } }, 422);
  }
  if (code === '42501') return json({ error: { code: 'forbidden', message: 'This change is not allowed.' } }, 403);
  if (code === '40P01' || code === '40001') return json({ error: { code: 'conflict', message: 'Someone else changed this at the same moment. Please try again.' } }, 409);
  if (code === '22008' || code === '22007') return json({ error: { code: 'validation_failed', message: 'This date does not exist.' } }, 422);
  log.error('unhandled error', { requestId, error: err?.message, code, stack: err?.stack });
  return json({ error: { code: 'internal', message: 'Something went wrong.', requestId } }, 500);
}

/**
 * Wrap a route handler.
 * @param {(ctx) => Promise<Response|object>} handler
 * @param {{auth?: boolean, action?: string}} opts  action: permission needed in params.orgId
 */
export function route(handler, opts = {}) {
  const { auth = true, action, flag } = opts;
  return async function (request, context) {
    // Honour an incoming request id from a trusted proxy, otherwise make one; echoed in the response.
    const incoming = request.headers.get('x-request-id');
    const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    const started = Date.now();
    let response;
    let ctx = { request, requestId, params: (await context?.params) ?? {} };
    try {
      if (auth) {
        const { token, via } = readToken(request);
        if (!token) throw unauthorized();
        checkCsrf(request, via);
        const s = await getSessionUser(token);
        if (!s) throw unauthorized('Your session has ended. Please sign in again.');
        ctx = { ...ctx, user: s.user, tokenHash: s.tokenHash, via };
        if (ctx.params.orgId !== undefined) {
          if (!isUuid(ctx.params.orgId)) throw notFound('Organization not found.');
          const role = await memberRole(s.user.id, ctx.params.orgId);
          if (!role) throw notFound('Organization not found.');
          ctx.orgId = ctx.params.orgId;
          ctx.role = role;
          ctx.db = { userId: s.user.id, orgId: ctx.orgId };
        }
        if (action) {
          if (!ctx.role) throw new Error('route: action requires an orgId param');
          if (!can(ctx.role, action)) throw forbidden();
        }
        if (flag && !(await flagEnabled(flag, ctx.orgId))) throw notFound('This feature is not available.');
      } else if (!SAFE_METHODS.has(request.method)) {
        // Unauthenticated endpoints (signup/login): browsers always send Origin on POST, so a
        // foreign Origin is refused (login CSRF). Native apps send no Origin and are allowed.
        const origin = request.headers.get('origin');
        if (origin && !allowedOrigins(request).has(origin)) throw forbidden('Request origin not allowed.');
      }
      const out = await handler(ctx);
      response = out instanceof Response ? out : json(out ?? { ok: true });
    } catch (err) {
      response = errorResponse(err, requestId);
      // Security-relevant refusals are recorded (who, what, from where) for review.
      const st = response.status;
      if (auth && (st === 401 || st === 403 || st === 429)) {
        securityEvent(st === 401 ? 'auth.rejected' : st === 403 ? 'access.denied' : 'rate.limited', {
          userId: ctx.user?.id, orgId: ctx.orgId, ip: clientIp(request), requestId,
          detail: `${request.method} ${routePattern(new URL(request.url).pathname)}`,
        }).catch(() => {});
      }
    } finally {
      const route = routePattern(new URL(request.url).pathname);
      const ms = Date.now() - started;
      metrics.httpDuration.observe({ method: request.method, route, status: String(response?.status ?? 500) }, ms / 1000);
      if (process.env.LOG_REQUESTS === '1' || ms > Number(process.env.SLOW_REQUEST_MS || 2000)) {
        log[ms > Number(process.env.SLOW_REQUEST_MS || 2000) ? 'warn' : 'info']('request', { requestId, method: request.method, route,
          status: response?.status, ms, userId: ctx.user?.id, orgId: ctx.orgId });
      }
    }
    response.headers.set('x-request-id', requestId);
    return response;
  };
}

/** Membership lookup under RLS (memberships are visible to their own user). */
async function memberRole(userId, orgId) {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const { rows } = await client.query('select role from memberships where org_id = $1 and user_id = $2', [orgId, userId]);
    await client.query('commit');
    return rows[0]?.role ?? null;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export function sessionCookie(token, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}
export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
