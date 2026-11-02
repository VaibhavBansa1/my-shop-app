// Security event log. Writes never block or break a request.
import { getPool, withOrg, isUuid } from '../db.js';
import { countEvent } from '../metrics.js';
import { log } from '../log.js';

export const SECURITY_EVENTS = ['login.success', 'login.failure', 'login.throttled', 'signup', 'logout', 'password.changed',
  'password.reset_requested', 'password.reset_done', 'email.verified', 'session.revoked', 'sessions.revoked_all',
  'auth.rejected', 'access.denied', 'rate.limited', 'org.deleted', 'member.role_changed', 'member.removed', 'export.downloaded'];

export async function securityEvent(event, { userId = null, orgId = null, ip = null, userAgent = null, requestId = null, detail = null } = {}) {
  countEvent(event);
  if (process.env.SECURITY_LOG_STDOUT === '1') log.info('security', { event, userId, orgId, ip, requestId, detail });
  try {
    await getPool().query(
      `insert into security_events (event, user_id, org_id, ip, user_agent, request_id, detail) values ($1, $2, $3, $4, $5, $6, $7)`,
      [event, isUuid(userId) ? userId : null, isUuid(orgId) ? orgId : null, ip ? String(ip).slice(0, 64) : null,
       userAgent ? String(userAgent).slice(0, 300) : null, requestId ? String(requestId).slice(0, 64) : null, detail ? String(detail).slice(0, 500) : null]);
  } catch (e) {
    log.warn('security event not stored', { event, error: e.message });
  }
}

/** A user's own recent security events (sign-ins, failures, password changes…). */
export async function myEvents(userId, limit = 50) {
  return withOrg({ userId }, async (c) => (await c.query(
    `select event, at, ip, user_agent, detail from security_events where user_id = $1 order by at desc limit $2`, [userId, Math.min(limit, 200)])).rows);
}
