import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, makeUserOrg, closePool, uniqueEmail } from './helpers.js';

before(setupDb);
after(closePool);

test('invite, accept, role rules, last owner protection', async () => {
  const O = await import('../lib/services/orgs.js');
  const { signup } = await import('../lib/services/accounts.js');
  const a = await makeUserOrg();
  const email = uniqueEmail('staff');
  const inv = await O.inviteMember(a.db, 'owner', { email, role: 'cashier' });
  assert.ok(inv.token.length > 20);

  const other = await signup({ name: 'Other', email: uniqueEmail(), password: 'another long password' }, { ip: 'm1' });
  await assert.rejects(O.acceptInvitation(other.user.id, inv.token), /different email/);

  const staff = await signup({ name: 'Staff', email, password: 'another long password' }, { ip: 'm2' });
  const prev = await O.previewInvitation(staff.user.id, inv.token);
  assert.equal(prev.role, 'cashier');
  const acc = await O.acceptInvitation(staff.user.id, inv.token);
  assert.equal(acc.orgId, a.org.id);
  await assert.rejects(O.acceptInvitation(staff.user.id, inv.token), /invalid or has expired/);

  const orgs = await O.listMyOrgs(staff.user.id);
  assert.deepEqual(orgs.map((o) => o.id), [a.org.id]);

  // admin cannot be invited by an admin, cashier cannot manage anyone
  await assert.rejects(O.inviteMember(a.db, 'admin', { email: uniqueEmail(), role: 'admin' }), /cannot invite/);
  const staffDb = { userId: staff.user.id, orgId: a.org.id };
  await assert.rejects(O.changeMemberRole(staffDb, 'cashier', a.user.id, 'viewer'), /permission/);

  // last owner cannot leave or be demoted
  await assert.rejects(O.removeMember(a.db, 'owner', a.user.id), /last owner/);
  await assert.rejects(O.changeMemberRole(a.db, 'owner', a.user.id, 'admin'), /at least one owner/);

  // promote staff to owner, then original owner may leave
  await O.changeMemberRole(a.db, 'owner', staff.user.id, 'owner');
  await O.removeMember(a.db, 'owner', a.user.id);
  assert.equal((await O.listMyOrgs(a.user.id)).length, 0);
});

test('a user\'s own membership in org B is not affected by actions in org A', async () => {
  const O = await import('../lib/services/orgs.js');
  const a = await makeUserOrg();
  const b2 = await O.createOrg(a.user.id, { name: 'Second Shop', legalName: '', country: 'IN', currency: 'INR', address: '',
    phone: '', email: '', fyStartMonth: 4 });
  await O.inviteMember(a.db, 'owner', { email: uniqueEmail(), role: 'viewer' });
  // In org A, the owner tries to remove themself -> last owner of A, refused; org B membership untouched.
  await assert.rejects(O.removeMember(a.db, 'owner', a.user.id));
  const mine = await O.listMyOrgs(a.user.id);
  assert.equal(mine.length, 2);
  assert.ok(mine.some((o) => o.id === b2.id && o.role === 'owner'));
});

test('owner can delete an organization; everything in it goes, other orgs untouched', async () => {
  const O = await import('../lib/services/orgs.js');
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const m = await import('../lib/services/masters.js');
  const { withOrg } = await import('../lib/db.js');
  const a = await makeUserOrg();
  const b = await makeUserOrg();
  const cash = (await m.listLedgers(a.db)).find((l) => l.code === 'cash').id;
  const rent = (await m.listLedgers(a.db)).find((l) => l.code === 'rent').id;
  await createVoucher(a.db, { type: 'payment', date: '2026-05-01', reference: '', narration: '', items: [],
    entries: [{ ledgerId: rent, debit: 10 }, { ledgerId: cash, credit: 10 }] });
  await assert.rejects(O.deleteOrg(a.db, 'wrong name'), /exactly/);
  await O.deleteOrg(a.db, a.org.name);
  assert.equal((await O.listMyOrgs(a.user.id)).length, 0);
  const left = await withOrg(a.db, (c) => c.query('select count(*)::int n from vouchers'));
  assert.equal(left.rows[0].n, 0);
  assert.ok((await m.listLedgers(b.db)).length > 5);
});

test('built-in ledgers cannot be deactivated or renamed', async () => {
  const m = await import('../lib/services/masters.js');
  const a = await makeUserOrg();
  const cash = (await m.listLedgers(a.db)).find((l) => l.code === 'cash').id;
  await assert.rejects(m.updateLedger(a.db, cash, { isActive: false }), /Built-in/);
  await assert.rejects(m.updateLedger(a.db, cash, { name: 'Petty' }), /Built-in/);
  const u = await m.updateLedger(a.db, cash, { openingBalance: '100' });
  assert.equal(u.openingBalance, 100);
});
