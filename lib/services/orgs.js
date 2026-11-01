// Organizations and team membership.
import { randomBytes, randomUUID } from 'node:crypto';
import { withOrg } from '../db.js';
import { hashToken } from '../auth/session.js';
import { audit } from './audit.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { canManageRole } from '../permissions.js';
import { requireVerified } from './verification.js';
import { sendEmail } from '../email.js';
import { inviteMessage } from '../emailTemplates.js';

export const mapOrg = (r) => ({
  id: r.id, name: r.name, legalName: r.legal_name, gstin: r.gstin, stateCode: r.state_code,
  country: r.country, currency: r.currency, address: r.address, phone: r.phone, email: r.email,
  fyStartMonth: r.fy_start_month, booksFrom: r.books_from, aiEnabled: r.ai_enabled, createdAt: r.created_at, role: r.role,
});

export async function listMyOrgs(userId) {
  return withOrg({ userId }, async (c) => {
    const { rows } = await c.query(
      `select o.*, m.role from organizations o join memberships m on m.org_id = o.id and m.user_id = $1
        order by o.name`, [userId]);
    return rows.map(mapOrg);
  });
}

export async function createOrg(userId, input) {
  await requireVerified(userId);
  const orgId = randomUUID();
  return withOrg({ userId, orgId }, async (c) => {
    const { rows: cnt } = await c.query('select count(*)::int n from memberships where user_id = $1 and role = $2', [userId, 'owner']);
    if (cnt[0].n >= 20) throw badRequest('You can own at most 20 organizations.');
    await c.query(
      `insert into organizations (id, name, legal_name, gstin, state_code, country, currency, address, phone, email,
                                  fy_start_month, books_from, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,coalesce($12::date, current_date),$13)`,
      [orgId, input.name, input.legalName, input.gstin ?? null,
       input.stateCode ?? (input.gstin ? input.gstin.slice(0, 2) : null),
       input.country, input.currency, input.address, input.phone, input.email, input.fyStartMonth,
       input.booksFrom ?? null, userId],
    );
    await c.query('insert into memberships (org_id, user_id, role) values ($1, $2, $3)', [orgId, userId, 'owner']);
    await c.query('select seed_organization($1)', [orgId]);
    await audit(c, { orgId, userId }, 'org.create', 'organization', orgId, { name: input.name });
    const { rows } = await c.query("select o.*, 'owner' as role from organizations o where id = $1", [orgId]);
    return mapOrg(rows[0]);
  });
}

export async function getOrg(db) {
  return withOrg(db, async (c) => {
    const { rows } = await c.query(
      'select o.*, m.role from organizations o join memberships m on m.org_id = o.id and m.user_id = $2 where o.id = $1',
      [db.orgId, db.userId]);
    if (!rows.length) throw notFound();
    return mapOrg(rows[0]);
  });
}

export async function updateOrg(db, input) {
  const cols = { name: 'name', legalName: 'legal_name', gstin: 'gstin', stateCode: 'state_code', country: 'country',
    currency: 'currency', address: 'address', phone: 'phone', email: 'email', fyStartMonth: 'fy_start_month', booksFrom: 'books_from',
    aiEnabled: 'ai_enabled' };
  const sets = []; const vals = [];
  for (const [k, col] of Object.entries(cols)) {
    if (input[k] !== undefined) { vals.push(input[k]); sets.push(`${col} = $${vals.length}`); }
  }
  if (!sets.length) return getOrg(db);
  await withOrg(db, async (c) => {
    if (input.booksFrom !== undefined) {
      const { rows } = await c.query('select min(date) as first from vouchers');
      if (rows[0].first && input.booksFrom > String(rows[0].first)) {
        throw badRequest(`Books cannot start after your first voucher (${rows[0].first}).`);
      }
    }
    vals.push(db.orgId);
    await c.query(`update organizations set ${sets.join(', ')} where id = $${vals.length}`, vals);
    await audit(c, db, 'org.update', 'organization', db.orgId, input);
  });
  return getOrg(db);
}

export async function deleteOrg(db, confirmName) {
  await withOrg(db, async (c) => {
    const { rows } = await c.query('select name from organizations where id = $1', [db.orgId]);
    if (!rows.length) throw notFound();
    if (rows[0].name !== confirmName) throw badRequest('Type the organization name exactly to confirm.');
    await c.query('delete from organizations where id = $1', [db.orgId]);
  });
}

// ---------------- members ----------------
export async function listMembers(db) {
  return withOrg(db, async (c) => {
    const members = await c.query(
      `select m.user_id, m.role, m.created_at, u.name, u.email from memberships m
         join users u on u.id = m.user_id where m.org_id = $1 order by m.created_at`, [db.orgId]);
    const invites = await c.query(
      `select id, email, role, created_at, expires_at from invitations
        where accepted_at is null and revoked_at is null and expires_at > now() order by created_at desc`);
    return {
      members: members.rows.map((r) => ({ userId: r.user_id, name: r.name, email: r.email, role: r.role, joinedAt: r.created_at })),
      invitations: invites.rows.map((r) => ({ id: r.id, email: r.email, role: r.role, createdAt: r.created_at, expiresAt: r.expires_at })),
    };
  });
}

/** Returns the one-time token; only its hash is stored. */
export async function inviteMember(db, actorRole, { email, role }, { origin } = {}) {
  if (!canManageRole(actorRole, role)) throw forbidden('You cannot invite someone with that role.');
  const token = randomBytes(24).toString('base64url');
  return withOrg(db, async (c) => {
    const existing = await c.query(
      'select 1 from memberships m join users u on u.id = m.user_id where m.org_id = $1 and u.email = $2', [db.orgId, email]);
    if (existing.rowCount) throw conflict('This person is already a member.');
    const pending = await c.query('select count(*)::int n from invitations where accepted_at is null and revoked_at is null and expires_at > now()');
    if (pending.rows[0].n >= 50) throw badRequest('Too many pending invitations. Revoke some first.');
    const { rows } = await c.query(
      `insert into invitations (org_id, email, role, token_hash, invited_by, expires_at)
       values ($1, $2, $3, $4, $5, now() + interval '7 days') returning id, expires_at`,
      [db.orgId, email, role, hashToken(token), db.userId]);
    await audit(c, db, 'member.invite', 'invitation', rows[0].id, { email, role });
    const names = await c.query('select o.name as org, u.name as inviter from organizations o, users u where o.id = $1 and u.id = $2', [db.orgId, db.userId]);
    return { id: rows[0].id, token, expiresAt: rows[0].expires_at, orgName: names.rows[0].org, inviterName: names.rows[0].inviter };
  }).then(async (inv) => {
    // Email the link (after commit). The link is also returned so it can be shared on WhatsApp.
    if (origin) {
      const r = await sendEmail({ to: email, ...inviteMessage(inv.orgName, inv.inviterName, role, `${origin}/invite#${inv.token}`) });
      inv.emailed = Boolean(r.ok && !r.logged);
    }
    return inv;
  });
}

export async function revokeInvitation(db, invitationId) {
  await withOrg(db, async (c) => {
    const r = await c.query('update invitations set revoked_at = now() where id = $1 and accepted_at is null and revoked_at is null', [invitationId]);
    if (!r.rowCount) throw notFound('Invitation not found.');
    await audit(c, db, 'member.invite_revoke', 'invitation', invitationId);
  });
}

export async function previewInvitation(userId, token) {
  return withOrg({ userId }, async (c) => {
    const { rows } = await c.query('select * from invitation_preview($1)', [hashToken(token)]);
    if (!rows.length) throw notFound('This invitation link is invalid or has expired.');
    return { orgName: rows[0].org_name, role: rows[0].role, email: rows[0].email, expiresAt: rows[0].expires_at };
  });
}

export async function acceptInvitation(userId, token) {
  await requireVerified(userId);
  return withOrg({ userId }, async (c) => {
    try {
      const { rows } = await c.query('select * from accept_invitation($1, $2)', [hashToken(token), userId]);
      return { orgId: rows[0].org_id, role: rows[0].role };
    } catch (e) {
      if (e.code === 'P0002') throw notFound('This invitation link is invalid or has expired.');
      if (e.code === '42501') throw forbidden('This invitation was sent to a different email address. Sign in with that email.');
      throw e;
    }
  });
}

async function ownerCount(c) {
  const { rows } = await c.query("select count(*)::int n from memberships where org_id = app_org_id() and role = 'owner'");
  return rows[0].n;
}

export async function changeMemberRole(db, actorRole, targetUserId, newRole) {
  return withOrg(db, async (c) => {
    const { rows } = await c.query('select role from memberships where org_id = app_org_id() and user_id = $1 for update', [targetUserId]);
    if (!rows.length) throw notFound('Member not found.');
    const current = rows[0].role;
    if (!canManageRole(actorRole, current) || !canManageRole(actorRole, newRole)) throw forbidden();
    if (current === 'owner' && newRole !== 'owner' && (await ownerCount(c)) <= 1) {
      throw badRequest('An organization must have at least one owner.');
    }
    await c.query('update memberships set role = $1 where org_id = app_org_id() and user_id = $2', [newRole, targetUserId]);
    await audit(c, db, 'member.role_change', 'membership', targetUserId, { from: current, to: newRole });
  });
}

export async function removeMember(db, actorRole, targetUserId) {
  return withOrg(db, async (c) => {
    const { rows } = await c.query('select role from memberships where org_id = app_org_id() and user_id = $1 for update', [targetUserId]);
    if (!rows.length) throw notFound('Member not found.');
    const self = targetUserId === db.userId;
    if (!self && !canManageRole(actorRole, rows[0].role)) throw forbidden();
    if (rows[0].role === 'owner' && (await ownerCount(c)) <= 1) {
      throw badRequest('The last owner cannot leave. Make someone else an owner first, or delete the organization.');
    }
    await c.query('delete from memberships where org_id = app_org_id() and user_id = $1', [targetUserId]);
    await audit(c, db, self ? 'member.leave' : 'member.remove', 'membership', targetUserId, { role: rows[0].role });
  });
}
