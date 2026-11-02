// Organizations and team membership.
import { randomBytes, randomUUID } from 'node:crypto';
import { withOrg } from '../db.js';
import { hashToken } from '../auth/session.js';
import { audit, redactContact } from './audit.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { canManageRole } from '../permissions.js';
import { requireVerified, requireVerifiedForInvite, verificationPolicy } from './verification.js';
import { deliverEmail as sendEmail } from '../email.js';
import { inviteMessage } from '../emailTemplates.js';
import { decryptField as dec, encryptField as enc } from '../crypto.js';
import { imageUrls } from '../images.js';

export const mapOrg = (r) => ({
  id: r.id, name: r.name, legalName: r.legal_name, gstin: r.gstin, stateCode: r.state_code,
  country: r.country, currency: r.currency, address: dec(r.address), phone: dec(r.phone), email: dec(r.email),
  fyStartMonth: r.fy_start_month, booksFrom: r.books_from, aiEnabled: r.ai_enabled, upiId: r.upi_id, logoImageId: r.logo_image_id ?? null,
  logo: r.logo_variants ? imageUrls(r.logo_variants) : null, createdAt: r.created_at, role: r.role,
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
       input.country, input.currency, enc(input.address), enc(input.phone), enc(input.email), input.fyStartMonth,
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
      `select o.*, m.role, (select im.variants from images im where im.id = o.logo_image_id) as logo_variants
         from organizations o join memberships m on m.org_id = o.id and m.user_id = $2 where o.id = $1`,
      [db.orgId, db.userId]);
    if (!rows.length) throw notFound();
    return mapOrg(rows[0]);
  });
}

export async function updateOrg(db, input) {
  const cols = { name: 'name', legalName: 'legal_name', gstin: 'gstin', stateCode: 'state_code', country: 'country',
    currency: 'currency', address: 'address', phone: 'phone', email: 'email', fyStartMonth: 'fy_start_month', booksFrom: 'books_from',
    aiEnabled: 'ai_enabled', upiId: 'upi_id', logoImageId: 'logo_image_id' };
  const sets = []; const vals = [];
  for (const [k, col] of Object.entries(cols)) {
    if (input[k] !== undefined) { vals.push(['address', 'phone', 'email'].includes(col) ? enc(input[k]) : input[k]); sets.push(`${col} = $${vals.length}`); }
  }
  if (!sets.length) return getOrg(db);
  await withOrg(db, async (c) => {
    if (input.gstin !== undefined || input.stateCode !== undefined) {
      const cur = (await c.query('select gstin, state_code from organizations where id = $1', [db.orgId])).rows[0];
      const g = input.gstin !== undefined ? input.gstin : cur.gstin;
      const st = input.stateCode !== undefined ? input.stateCode : cur.state_code;
      if (g && st && g.slice(0, 2) !== st) throw badRequest(`State code ${st} does not match the GSTIN (which starts with ${g.slice(0, 2)}).`);
    }
    if (input.booksFrom !== undefined) {
      const { rows } = await c.query('select min(date) as first from vouchers');
      if (rows[0].first && input.booksFrom > String(rows[0].first)) {
        throw badRequest(`Books cannot start after your first voucher (${rows[0].first}).`);
      }
    }
    if (input.fyStartMonth !== undefined) {
      // Voucher numbers restart per financial year. Moving the FY start after bills exist would start a new
      // series that prints the same numbers again (e.g. two "INV/27-28/1") - not allowed on GST invoices.
      const { rows } = await c.query('select fy_start_month, exists(select 1 from vouchers) as used from organizations where id = $1', [db.orgId]);
      if (rows[0].used && rows[0].fy_start_month !== input.fyStartMonth) {
        throw badRequest('The financial year start cannot change after vouchers are entered (invoice numbers would repeat).');
      }
    }
    vals.push(db.orgId);
    // data_version + 1: report defaults depend on these settings (books start date), so cached reports refresh.
    await c.query(`update organizations set ${sets.join(', ')}, data_version = data_version + 1 where id = $${vals.length}`, vals);
    await audit(c, db, 'org.update', 'organization', db.orgId, redactContact(input));
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
    // false = this server cannot confirm email addresses, so anyone holding the link can sign up with that
    // address and join. The team page warns the inviter to share the link only with that person.
    inv.emailChecked = verificationPolicy() !== 'off';
    return inv;
  });
}

export async function revokeInvitation(db, invitationId, actorRole) {
  await withOrg(db, async (c) => {
    const inv = (await c.query('select role from invitations where id = $1 and accepted_at is null and revoked_at is null for update', [invitationId])).rows[0];
    if (!inv) throw notFound('Invitation not found.');
    // Same rule as sending: an admin cannot cancel an owner's invitation of another admin.
    if (actorRole && !canManageRole(actorRole, inv.role)) throw forbidden('You cannot cancel an invitation for that role.');
    await c.query('update invitations set revoked_at = now() where id = $1', [invitationId]);
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
  // The invitation is bound to an email address; that only means something if the person proved they
  // own the address. So whenever this server can send email, joining needs a confirmed email, even when
  // EMAIL_VERIFICATION=optional. (With no email at all, see docs/SECURITY_FINDINGS.md F-07.)
  await requireVerifiedForInvite(userId);
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

/**
 * Lock the business's owners and the target member, always in user_id order, then count owners.
 * Without this, two owners demoting each other at the same moment could both pass the
 * "at least one owner" check and leave the business with none (found by scripts/security/probe.mjs).
 */
async function lockOwnersAndTarget(c, targetUserId) {
  const { rows } = await c.query(
    `select user_id, role from memberships where org_id = app_org_id() and (role = 'owner' or user_id = $1)
      order by user_id for update`, [targetUserId]);
  return { target: rows.find((r) => r.user_id === targetUserId) ?? null, owners: rows.filter((r) => r.role === 'owner').length };
}

export async function changeMemberRole(db, actorRole, targetUserId, newRole) {
  return withOrg(db, async (c) => {
    const { target, owners } = await lockOwnersAndTarget(c, targetUserId);
    if (!target) throw notFound('Member not found.');
    const current = target.role;
    if (!canManageRole(actorRole, current) || !canManageRole(actorRole, newRole)) throw forbidden();
    // The actor's own role may have just changed in a parallel request: re-check it under the lock.
    const me = await c.query('select role from memberships where org_id = app_org_id() and user_id = app_user_id()');
    if (!me.rows.length || !canManageRole(me.rows[0].role, current) || !canManageRole(me.rows[0].role, newRole)) throw forbidden();
    if (current === 'owner' && newRole !== 'owner' && owners <= 1) {
      throw badRequest('An organization must have at least one owner.');
    }
    await c.query('update memberships set role = $1 where org_id = app_org_id() and user_id = $2', [newRole, targetUserId]);
    await audit(c, db, 'member.role_change', 'membership', targetUserId, { from: current, to: newRole });
  });
}

export async function removeMember(db, actorRole, targetUserId) {
  return withOrg(db, async (c) => {
    const { target, owners } = await lockOwnersAndTarget(c, targetUserId);
    if (!target) throw notFound('Member not found.');
    const rows = [target];
    const self = targetUserId === db.userId;
    if (!self) {
      const me = await c.query('select role from memberships where org_id = app_org_id() and user_id = app_user_id()');
      if (!me.rows.length || !canManageRole(me.rows[0].role, target.role)) throw forbidden();
    }
    if (rows[0].role === 'owner' && owners <= 1) {
      throw badRequest('The last owner cannot leave. Make someone else an owner first, or delete the organization.');
    }
    await c.query('delete from memberships where org_id = app_org_id() and user_id = $1', [targetUserId]);
    await audit(c, db, self ? 'member.leave' : 'member.remove', 'membership', targetUserId, { role: rows[0].role });
  });
}
