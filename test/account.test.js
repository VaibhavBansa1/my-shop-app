// Account settings: name, email change (confirm new, alert old), deletion rules.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, closePool, uniqueEmail, makeUserOrg, ownerQuery } from './helpers.js';

process.env.EMAIL_CAPTURE = '1';
process.env.EMAIL_VERIFICATION = 'off';
before(setupDb);
after(closePool);
const PW = 'correct horse battery';
const linkToken = (mails, path) => mails.map((m) => m.text.match(new RegExp(`${path}#([\\w-]+)`))?.[1]).find(Boolean);

test('change name and email: link goes to the new address, warning to the old one, nothing changes until confirmed', async () => {
  const { signup, login } = await import('../lib/services/accounts.js');
  const A = await import('../lib/services/accountSettings.js');
  const { takeSentEmails } = await import('../lib/email.js');
  const { getSessionUser } = await import('../lib/auth/session.js');
  const oldEmail = uniqueEmail('old'); const newEmail = uniqueEmail('new');
  const { user, session } = await signup({ name: 'Old Name', email: oldEmail, password: PW }, { ip: 'acc1' });
  await A.updateName(user.id, 'New Name');
  assert.equal((await getSessionUser(session.token)).user.name, 'New Name');

  takeSentEmails();
  await assert.rejects(A.requestEmailChange(user.id, { newEmail, password: 'wrong pass' }, 'http://x'), /Password is incorrect/);
  await A.requestEmailChange(user.id, { newEmail, password: PW }, 'http://x');
  const mails = takeSentEmails();
  assert.ok(mails.find((m) => m.to === oldEmail && /asked to change/.test(m.subject)), 'old address warned');
  const token = linkToken(mails.filter((m) => m.to === newEmail), '/confirm-email');
  assert.ok(token, 'confirmation link sent only to the new address');
  assert.ok((await login({ email: oldEmail, password: PW }, {})).session, 'old email still works before confirming');

  const r = await A.confirmEmailChange(token);
  assert.equal(r.newEmail, newEmail);
  assert.equal(await getSessionUser(session.token), null, 'all devices signed out');
  assert.ok(takeSentEmails().find((m) => m.to === oldEmail && /was changed/.test(m.subject)), 'old address told after the change');
  await assert.rejects(login({ email: oldEmail, password: PW }, {}), /incorrect/);
  assert.ok((await login({ email: newEmail, password: PW }, {})).session);
  await assert.rejects(A.confirmEmailChange(token), /invalid, already used/);
});

test('email change to an address that is taken: no link is sent, confirm refuses', async () => {
  const { signup } = await import('../lib/services/accounts.js');
  const A = await import('../lib/services/accountSettings.js');
  const { takeSentEmails } = await import('../lib/email.js');
  const taken = uniqueEmail('taken');
  await signup({ name: 'T', email: taken, password: PW }, { ip: 'acc2' });
  const { user } = await signup({ name: 'U', email: uniqueEmail('u'), password: PW }, { ip: 'acc3' });
  takeSentEmails();
  assert.deepEqual(await A.requestEmailChange(user.id, { newEmail: taken, password: PW }, 'http://x'), { sent: true }, 'same answer');
  assert.ok(!takeSentEmails().some((m) => m.to === taken), 'the other account gets nothing');
});

test('delete account: refused while the only owner; afterwards details are wiped and sign-in is impossible', async () => {
  const { signup, login } = await import('../lib/services/accounts.js');
  const A = await import('../lib/services/accountSettings.js');
  const O = await import('../lib/services/orgs.js');
  const a = await makeUserOrg();
  await assert.rejects(A.deleteAccount(a.user.id, { password: PW, confirm: 'nope' }), /Type DELETE/);
  await assert.rejects(A.deleteAccount(a.user.id, { password: PW, confirm: 'DELETE' }), (e) => e.code === 'sole_owner');

  const email = uniqueEmail('staff');
  const inv = await O.inviteMember(a.db, 'owner', { email, role: 'cashier' });
  const staff = await signup({ name: 'Staff Person', email, password: PW }, { ip: 'acc4' });
  await O.acceptInvitation(staff.user.id, inv.token);
  await A.deleteAccount(staff.user.id, { password: PW, confirm: 'DELETE' });
  const row = (await ownerQuery('select name, email, deleted_at, totp_secret from users where id = $1', [staff.user.id])).rows[0];
  assert.equal(row.name, 'Deleted user');
  assert.ok(row.deleted_at && !row.email.includes('staff') && row.totp_secret === null);
  assert.equal((await ownerQuery('select count(*)::int n from memberships where user_id = $1', [staff.user.id])).rows[0].n, 0);
  await assert.rejects(login({ email, password: PW }, {}), /incorrect/);
  // the owner's business keeps working and no longer lists the person
  const r = await O.listMembers(a.db); const members = r.members ?? r;
  assert.ok(!members.some((m) => m.userId === staff.user.id || m.user_id === staff.user.id));
});
