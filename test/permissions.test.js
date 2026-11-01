// Role x endpoint matrix through the real HTTP handlers (auth, CSRF, validation, RLS, permissions).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, makeUserOrg, closePool, uniqueEmail } from './helpers.js';

process.env.EMAIL_CAPTURE = '1';
process.env.EMAIL_VERIFICATION = 'off';
before(setupDb);
after(closePool);

const RANK = ['viewer', 'cashier', 'accountant', 'admin', 'owner'];
const H = (dir) => import(`../app/api/v1/orgs/[orgId]/${dir}/route.js`);

async function call(mod, method, token, params, body, query = '') {
  const init = { method, headers: { authorization: `Bearer ${token}` } };
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
  const res = await mod[method](new Request(`http://localhost/x${query}`, init), { params: Promise.resolve(params) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('every role can do exactly what its permissions allow', async () => {
  const A = await import('../lib/services/accounts.js');
  const O = await import('../lib/services/orgs.js');
  const m = await import('../lib/services/masters.js');
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const owner = await makeUserOrg();
  const orgId = owner.org.id;
  const tokens = {};
  // Create one member per role via invitation, and get a bearer token for each.
  for (const role of ['admin', 'accountant', 'cashier', 'viewer']) {
    const email = uniqueEmail(role);
    const inv = await O.inviteMember(owner.db, 'owner', { email, role });
    const { user, session } = await A.signup({ name: role, email, password: 'role tester password' }, { ip: `p-${role}` });
    await O.acceptInvitation(user.id, inv.token);
    tokens[role] = session.token;
  }
  // Owner token
  const ownerEmail = uniqueEmail('owner2');
  const o2 = await A.signup({ name: 'Owner2', email: ownerEmail, password: 'role tester password' }, { ip: 'p-o' });
  const inv = await O.inviteMember(owner.db, 'owner', { email: ownerEmail, role: 'admin' });
  await O.acceptInvitation(o2.user.id, inv.token);
  await O.changeMemberRole(owner.db, 'owner', o2.user.id, 'owner');
  tokens.owner = o2.session.token;

  const groups = await m.listGroups(owner.db);
  const g = (c) => groups.find((x) => x.code === c).id;
  const pcs = (await m.listUnits(owner.db)).find((u) => u.symbol === 'pcs').id;
  const item = await m.createItem(owner.db, { name: 'Matrix Item', unitId: pcs, salePrice: 10, openingQty: 100, openingRate: 5 });
  const ledgers = await m.listLedgers(owner.db);
  const L = (c) => ledgers.find((l) => l.code === c).id;
  const today = new Date().toISOString().slice(0, 10);
  const CUST = (await m.createLedger(owner.db, { name: 'Matrix Customer', groupId: g('sundry_debtors') })).id;

  let n = 0;
  const uniq = () => `${Date.now()}-${n++}`;
  const cases = [
    ['read business', '.', 'GET', 'viewer', {}],
    ['update business', '.', 'PATCH', 'admin', {}, () => ({ phone: '123' })],
    ['delete business (wrong name)', '.', 'DELETE', 'owner', {}, () => ({ confirmName: 'nope' }), 400],
    ['list members', 'members', 'GET', 'admin', {}],
    ['invite', 'invitations', 'POST', 'admin', {}, () => ({ email: uniqueEmail('x'), role: 'viewer' })],
    ['list groups', 'groups', 'GET', 'viewer', {}],
    ['create group', 'groups', 'POST', 'accountant', {}, () => ({ name: `Group ${uniq()}`, parentId: g('indirect_expenses') })],
    ['list ledgers', 'ledgers', 'GET', 'viewer', {}],
    ['create customer', 'ledgers', 'POST', 'cashier', {}, () => ({ name: `Cust ${uniq()}`, groupId: g('sundry_debtors') })],
    ['create expense ledger', 'ledgers', 'POST', 'accountant', {}, () => ({ name: `Exp ${uniq()}`, groupId: g('indirect_expenses') })],
    ['edit ledger', 'ledgers/[ledgerId]', 'PATCH', 'accountant', { ledgerId: L('rent') }, () => ({ phone: '9' })],
    ['create unit', 'units', 'POST', 'accountant', {}, () => ({ symbol: `u${n++}`, name: 'Unit' })],
    ['create item', 'items', 'POST', 'accountant', {}, () => ({ name: `Item ${uniq()}`, unitId: pcs })],
    ['sale', 'vouchers', 'POST', 'cashier', {}, () => ({ type: 'sales', date: today, items: [{ stockItemId: item.id, qty: 1, rate: 10 }] })],
    ['receipt', 'vouchers', 'POST', 'cashier', {}, () => ({ type: 'receipt', date: today, entries: [{ ledgerId: L('cash'), debit: 1 }, { ledgerId: L('capital'), credit: 1 }] })],
    ['purchase', 'vouchers', 'POST', 'accountant', {}, () => ({ type: 'purchase', date: today, items: [{ stockItemId: item.id, qty: 1, rate: 5 }] })],
    ['payment', 'vouchers', 'POST', 'accountant', {}, () => ({ type: 'payment', date: today, entries: [{ ledgerId: L('rent'), debit: 1 }, { ledgerId: L('cash'), credit: 1 }] })],
    ['list vouchers', 'vouchers', 'GET', 'viewer', {}],
    ['reports', 'reports/[report]', 'GET', 'viewer', { report: 'profit-loss' }],
    ['audit log', 'audit', 'GET', 'admin', {}],
    ['backup export', 'export', 'GET', 'admin', {}],
    ['my notifications', 'notifications', 'GET', 'viewer', {}],
    ['mark notifications read', 'notifications/read', 'POST', 'viewer', {}, () => ({ all: true })],
    ['notification settings', 'notification-settings', 'PATCH', 'viewer', {}, () => ({ notifyEmail: false })],
    ['prepare reminder', 'reminders/[ledgerId]', 'GET', 'cashier', { ledgerId: CUST }],
    ['scan text', 'ocr/parse', 'POST', 'accountant', {}, () => ({ text: 'Invoice No 1\nTotal 10' })],
  ];

  for (const [label, dir, method, minRole, params, bodyFn, okStatus] of cases) {
    const mod = await H(dir === '.' ? '.' : dir);
    for (const role of RANK) {
      const r = await call(mod, method, tokens[role], { orgId, ...params }, bodyFn?.());
      const allowed = RANK.indexOf(role) >= RANK.indexOf(minRole);
      if (allowed) assert.ok(r.status !== 403 && r.status < 500 && (!okStatus || r.status === okStatus), `${label} as ${role}: expected allowed, got ${r.status} ${JSON.stringify(r.body)}`);
      else assert.equal(r.status, 403, `${label} as ${role}: expected 403, got ${r.status}`);
    }
  }

  // Cancel needs accountant: create fresh vouchers to cancel
  const cancelMod = await H('vouchers/[voucherId]/cancel');
  for (const role of RANK) {
    const v = await createVoucher(owner.db, { type: 'sales', date: today, reference: '', narration: '', items: [{ stockItemId: item.id, qty: 1, rate: 10 }], entries: [] });
    const r = await call(cancelMod, 'POST', tokens[role], { orgId, voucherId: v.id }, { reason: 'test' });
    assert.equal(r.status, RANK.indexOf(role) >= 2 ? 200 : 403, `cancel as ${role}`);
  }

  // A stranger (member of another business) gets 404 everywhere, never 403 (no existence leak).
  const stranger = await makeUserOrg();
  const sTok = (await A.login({ email: stranger.user.email, password: 'correct horse battery' }, { ip: 'p-s' })).session.token;
  for (const dir of ['.', 'ledgers', 'vouchers', 'audit']) {
    const r = await call(await H(dir), 'GET', sTok, { orgId });
    assert.equal(r.status, 404, `stranger GET ${dir}`);
  }
  // No token at all -> 401
  const r = await (await H('ledgers')).GET(new Request('http://localhost/x'), { params: Promise.resolve({ orgId }) });
  assert.equal(r.status, 401);
});
