// Tenant isolation: the most important security property of the system.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, makeUserOrg, closePool } from './helpers.js';

before(setupDb);
after(closePool);

test('org B cannot read or write org A data, even with raw SQL as shop_app', async () => {
  const { withOrg } = await import('../lib/db.js');
  const { listLedgers, createLedger } = await import('../lib/services/masters.js');
  const a = await makeUserOrg();
  const b = await makeUserOrg();

  const aLedgers = await listLedgers(a.db);
  assert.ok(aLedgers.length > 5);

  // Raw query with B's context sees only B's rows.
  const seen = await withOrg(b.db, async (c) => (await c.query('select distinct org_id from ledgers')).rows);
  assert.deepEqual(seen.map((r) => r.org_id), [b.org.id]);

  // B tries to read an A ledger by id: invisible.
  const target = aLedgers[0].id;
  const r = await withOrg(b.db, async (c) => (await c.query('select * from ledgers where id = $1', [target])).rowCount);
  assert.equal(r, 0);

  // B tries to insert a row tagged with A's org id: rejected by RLS WITH CHECK.
  const groupA = aLedgers[0].groupId;
  await assert.rejects(
    withOrg(b.db, (c) => c.query("insert into ledgers (org_id, group_id, name) values ($1, $2, 'evil')", [a.org.id, groupA])),
    /row-level security/);

  // B tries to reference A's group from a B ledger: the composite FK + RLS make it fail.
  await assert.rejects(createLedger(b.db, { name: 'x', groupId: groupA, openingBalance: 0, phone: '', email: '', address: '', isActive: true }));

  // B tries to update / delete A rows: zero rows affected.
  const upd = await withOrg(b.db, (c) => c.query("update ledgers set name = 'pwned' where org_id = $1", [a.org.id]));
  assert.equal(upd.rowCount, 0);
});

test('no context = no tenant rows', async () => {
  const { getPool } = await import('../lib/db.js');
  await makeUserOrg();
  const { rows } = await getPool().query('select count(*)::int n from ledgers');
  assert.equal(rows[0].n, 0);
  const orgs = await getPool().query('select count(*)::int n from organizations');
  assert.equal(orgs.rows[0].n, 0);
});

test('app role cannot delete vouchers or audit rows, nor bypass RLS', async () => {
  const { withOrg } = await import('../lib/db.js');
  const a = await makeUserOrg();
  await assert.rejects(withOrg(a.db, (c) => c.query('delete from vouchers')), /permission denied/);
  await assert.rejects(withOrg(a.db, (c) => c.query('delete from audit_log')), /permission denied/);
  await assert.rejects(withOrg(a.db, (c) => c.query('update audit_log set action = $1', ['x'])), /permission denied/);
  await assert.rejects(withOrg(a.db, (c) => c.query('alter table ledgers disable row level security')), /must be owner/);
  await assert.rejects(withOrg(a.db, (c) => c.query('set row_security = off; select * from ledgers')));
});

test('membership rows of other orgs stay hidden from org admins', async () => {
  const { listMembers, inviteMember, acceptInvitation } = await import('../lib/services/orgs.js');
  const a = await makeUserOrg();
  const b = await makeUserOrg();
  const list = await listMembers(a.db);
  assert.deepEqual(list.members.map((m) => m.userId), [a.user.id]);
  // B's owner is not visible to A even though both exist.
  assert.ok(!list.members.some((m) => m.userId === b.user.id));
  assert.ok(inviteMember && acceptInvitation);
});
