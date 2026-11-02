// Regression tests for security review round 2 (docs/SECURITY_FINDINGS.md, F-06 .. F-21).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, makeUserOrg, closePool, uniqueEmail, ownerQuery } from './helpers.js';
import { safeNextPath, DEFAULT_NEXT } from '../shared/safeNext.js';

process.env.EMAIL_CAPTURE = '1';
process.env.EMAIL_VERIFICATION = 'off';   // F-07 test switches it on for itself
before(setupDb);
after(closePool);

const PW = 'correct horse battery';
const base = { reference: '', narration: '', roundOff: true, items: [], entries: [] };

async function setup() {
  const m = await import('../lib/services/masters.js');
  const a = await makeUserOrg();
  const groups = await m.listGroups(a.db);
  const g = (code) => groups.find((x) => x.code === code).id;
  const pcs = (await m.listUnits(a.db)).find((u) => u.symbol === 'pcs').id;
  const customer = await m.createLedger(a.db, { name: 'Cust', groupId: g('sundry_debtors'), openingBalance: 0, phone: '', email: '', address: '', isActive: true });
  const other = await m.createLedger(a.db, { name: 'Other Cust', groupId: g('sundry_debtors'), openingBalance: 0, phone: '', email: '', address: '', isActive: true });
  const supplier = await m.createLedger(a.db, { name: 'Supp', groupId: g('sundry_creditors'), openingBalance: 0, phone: '', email: '', address: '', isActive: true });
  const bank = await m.createLedger(a.db, { name: 'Bank', groupId: g('bank_accounts'), openingBalance: 0, phone: '', email: '', address: '', isActive: true });
  const item = await m.createItem(a.db, { name: 'Soap', sku: '', unitId: pcs, hsnCode: '', gstRate: 18, salePrice: 10, purchasePrice: 5,
    reorderLevel: 0, openingQty: 50, openingRate: 5, isActive: true });
  const ledgers = await m.listLedgers(a.db);
  const code = (c) => ledgers.find((l) => l.code === c).id;
  return { ...a, m, g, customer, other, supplier, bank, item, code };
}

test('F-06 open redirect: only same-site paths survive, control characters and backslashes are refused', () => {
  const o = 'https://shop.example.in';
  assert.equal(safeNextPath('/o/123/vouchers?x=1#t', o), '/o/123/vouchers?x=1#t');
  for (const bad of ['//evil.com', '/\\evil.com', '/\t/evil.com', '/\n/evil.com', '/\r//evil.com', 'https://evil.com', 'javascript:alert(1)', '', null, '/%09/evil.com'.replace('%09', '\t')]) {
    assert.equal(safeNextPath(bad, o), DEFAULT_NEXT, JSON.stringify(bad));
  }
});

test('F-07 invitations need a confirmed email whenever verification is not off (also "optional")', async () => {
  const O = await import('../lib/services/orgs.js');
  const { signup } = await import('../lib/services/accounts.js');
  const prev = process.env.EMAIL_VERIFICATION;
  try {
    process.env.EMAIL_VERIFICATION = 'optional';
    const a = await makeUserOrg();
    const email = uniqueEmail('invitee');
    const inv = await O.inviteMember(a.db, 'owner', { email, role: 'accountant' });
    assert.equal(inv.emailChecked, true);
    const squatter = await signup({ name: 'Squatter', email, password: PW }, { ip: 'r2a' });
    await assert.rejects(O.acceptInvitation(squatter.user.id, inv.token), /confirm your email/);
    await ownerQuery('update users set email_verified_at = now() where id = $1', [squatter.user.id]);
    assert.equal((await O.acceptInvitation(squatter.user.id, inv.token)).role, 'accountant');
    process.env.EMAIL_VERIFICATION = 'off';
    const inv2 = await O.inviteMember(a.db, 'owner', { email: uniqueEmail('x'), role: 'viewer' });
    assert.equal(inv2.emailChecked, false, 'the team page warns the inviter when emails cannot be confirmed');
  } finally { if (prev === undefined) delete process.env.EMAIL_VERIFICATION; else process.env.EMAIL_VERIFICATION = prev; }
});

test('F-08 client IP is taken from the right of X-Forwarded-For (proxies append; the left is client-typed)', async () => {
  const { clientIp } = await import('../lib/http.js');
  const req = (xff) => new Request('http://x/', { headers: { 'x-forwarded-for': xff } });
  const prev = { t: process.env.TRUST_PROXY, h: process.env.TRUSTED_PROXY_HOPS };
  try {
    process.env.TRUST_PROXY = '1'; delete process.env.TRUSTED_PROXY_HOPS;
    assert.equal(clientIp(req('6.6.6.6, 203.0.113.9')), '203.0.113.9');
    process.env.TRUSTED_PROXY_HOPS = '2';
    assert.equal(clientIp(req('6.6.6.6, 203.0.113.9, 10.0.0.2')), '203.0.113.9');
    process.env.TRUST_PROXY = '0';
    assert.equal(clientIp(req('6.6.6.6')), 'unknown');
  } finally {
    for (const [k, v] of [['TRUST_PROXY', prev.t], ['TRUSTED_PROXY_HOPS', prev.h]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test('F-09/F-10 login: a stranger failing from another IP cannot lock the owner out; parallel guesses stay within the limit', async () => {
  const { signup, login } = await import('../lib/services/accounts.js');
  const email = uniqueEmail('victim');
  await signup({ name: 'Victim', email, password: PW }, { ip: 'r2b' });
  for (let i = 0; i < 10; i++) await assert.rejects(login({ email, password: 'wrong password!!' }, { ip: '198.51.100.7' }));
  await assert.rejects(login({ email, password: PW }, { ip: '198.51.100.7' }), /Too many/);
  const ok = await login({ email, password: PW }, { ip: '192.0.2.44' });
  assert.ok(ok.session, 'the real owner, from their own IP, still gets in');

  const email2 = uniqueEmail('burst');
  await signup({ name: 'Burst', email: email2, password: PW }, { ip: 'r2c' });
  const rs = await Promise.allSettled(Array.from({ length: 30 }, () => login({ email: email2, password: 'wrong password!!' }, {})));
  const verified = rs.filter((r) => /incorrect/.test(r.reason?.message)).length;
  assert.ok(verified <= 10, `at most 10 passwords actually checked, got ${verified}`);
});

test('F-11/F-13 password change is rate-limited and voids reset links requested before it', async () => {
  const { signup, changePassword } = await import('../lib/services/accounts.js');
  const { requestReset, confirmReset } = await import('../lib/services/passwordReset.js');
  const { takeSentEmails } = await import('../lib/email.js');
  const email = uniqueEmail('pw');
  const { user } = await signup({ name: 'Pw', email, password: PW }, { ip: 'r2d' });
  takeSentEmails();
  await requestReset(email, { origin: 'http://x' });
  const token = takeSentEmails().map((m) => m.text.match(/reset#([\w-]+)/)?.[1]).find(Boolean);
  assert.ok(token);
  await changePassword(user.id, { currentPassword: PW, newPassword: 'a new long password 1' });
  await assert.rejects(confirmReset(token, 'attacker password 99'), /invalid, already used, or expired/);

  for (let i = 0; i < 5; i++) await assert.rejects(changePassword(user.id, { currentPassword: 'guess number ' + i, newPassword: 'whatever long 1' }), /incorrect/);
  await assert.rejects(changePassword(user.id, { currentPassword: 'a new long password 1', newPassword: 'whatever long 1' }), /Too many/);
});

test('F-14 a cashier receipt cannot be a disguised journal or contra', async () => {
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const s = await setup();
  const L = { ...base, type: 'receipt', date: '2026-05-10', __limited: true };
  await assert.rejects(createVoucher(s.db, { ...L, entries: [
    { ledgerId: s.code('cash'), debit: '1' }, { ledgerId: s.code('capital'), debit: '9999' }, { ledgerId: s.customer.id, credit: '10000' }] }), /receipt can only/);
  await assert.rejects(createVoucher(s.db, { ...L, entries: [{ ledgerId: s.code('cash'), debit: '100' }, { ledgerId: s.bank.id, credit: '100' }] }), /receipt can only/);
  const ok = await createVoucher(s.db, { ...L, entries: [{ ledgerId: s.code('cash'), debit: '100' }, { ledgerId: s.customer.id, credit: '100' }] });
  assert.equal(ok.type, 'receipt');
  // Accountants keep the flexible form (e.g. receipt with discount allowed).
  await createVoucher(s.db, { ...L, __limited: false, entries: [
    { ledgerId: s.code('cash'), debit: '98' }, { ledgerId: s.code('capital'), debit: '2' }, { ledgerId: s.customer.id, credit: '100' }] });
});

test('F-15 bills: the account ledger must be a Sales/Purchase ledger; cashiers cannot change it or the GST rate', async () => {
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const s = await setup();
  const sale = { ...base, type: 'sales', date: '2026-05-10', partyLedgerId: s.customer.id, items: [{ stockItemId: s.item.id, qty: 1, rate: '100' }] };
  await assert.rejects(createVoucher(s.db, { ...sale, accountLedgerId: s.other.id }), /Sales Accounts/);
  await assert.rejects(createVoucher(s.db, { ...sale, accountLedgerId: s.code('capital') }), /Sales Accounts/);
  await assert.rejects(createVoucher(s.db, { ...sale, __limited: true, accountLedgerId: s.code('sales') }), /cannot change the Sales ledger/);
  await assert.rejects(createVoucher(s.db, { ...sale, __limited: true, items: [{ ...sale.items[0], gstRate: '0' }] }), /cannot change the GST rate/);
  const v = await createVoucher(s.db, { ...sale, __limited: true, items: [{ ...sale.items[0], gstRate: '18' }] });
  assert.equal(v.taxTotal, 18);
  await createVoucher(s.db, { ...sale, items: [{ ...sale.items[0], gstRate: '5' }] }); // accountant may override
});

test('F-16 a cashier cannot give a new customer an opening balance', async () => {
  const s = await setup();
  await assert.rejects(s.m.createLedger(s.db, { name: 'Friend', groupId: s.g('sundry_debtors'), openingBalance: '-50000', phone: '', email: '', address: '', isActive: true },
    { partyOnly: true }), /opening balance/);
  await s.m.createLedger(s.db, { name: 'Friend', groupId: s.g('sundry_debtors'), openingBalance: 0, phone: '', email: '', address: '', isActive: true }, { partyOnly: true });
});

test('F-18/F-20 settings: FY start is locked once vouchers exist; settings changes refresh cached reports; audit hides contact details', async () => {
  const O = await import('../lib/services/orgs.js');
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const s = await setup();
  await O.updateOrg(s.db, { fyStartMonth: 1 });   // no vouchers yet: allowed
  await O.updateOrg(s.db, { fyStartMonth: 4 });
  await createVoucher(s.db, { ...base, type: 'sales', date: '2026-05-10', items: [{ stockItemId: s.item.id, qty: 1, rate: '10' }] });
  await assert.rejects(O.updateOrg(s.db, { fyStartMonth: 1 }), /cannot change after vouchers/);
  const v0 = (await ownerQuery('select data_version from organizations where id = $1', [s.org.id])).rows[0].data_version;
  await O.updateOrg(s.db, { phone: '9876543210', booksFrom: '2026-04-01' });
  const v1 = (await ownerQuery('select data_version from organizations where id = $1', [s.org.id])).rows[0].data_version;
  assert.ok(Number(v1) > Number(v0));
  const { withOrg } = await import('../lib/db.js');
  const { rows } = await withOrg(s.db, (c) => c.query("select data as details from audit_log where action = 'org.update' order by id desc limit 1"));
  assert.equal(rows[0].details.phone, '(changed)');
  assert.ok(!JSON.stringify(rows).includes('9876543210'));
});

test('F-19 the database refuses lines added to an existing voucher', async () => {
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const { withOrg } = await import('../lib/db.js');
  const s = await setup();
  const v = await createVoucher(s.db, { ...base, type: 'sales', date: '2026-05-10', items: [{ stockItemId: s.item.id, qty: 1, rate: '10' }] });
  await assert.rejects(withOrg(s.db, (c) => c.query(
    `insert into voucher_entries (org_id, voucher_id, line_no, ledger_id, amount) values ($1, $2, 99, $3, 1), ($1, $2, 100, $4, -1)`,
    [s.org.id, v.id, s.code('cash'), s.code('sales')])), /only be added when the voucher is created/);
});

test('F-12 the same supplier bill saved twice at once is entered only once', async () => {
  const { createVoucher } = await import('../lib/services/vouchers.js');
  const s = await setup();
  const p = { ...base, type: 'purchase', date: '2026-05-10', partyLedgerId: s.supplier.id, reference: 'SB-77', items: [{ stockItemId: s.item.id, qty: 2, rate: '5' }] };
  const rs = await Promise.allSettled([1, 2, 3].map(() => createVoucher(s.db, p)));
  assert.equal(rs.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(rs.filter((r) => r.status === 'rejected').every((r) => /already entered/.test(r.reason.message)));
});

test('F-21 an admin cannot cancel an invitation of a role they cannot manage', async () => {
  const O = await import('../lib/services/orgs.js');
  const a = await makeUserOrg();
  const inv = await O.inviteMember(a.db, 'owner', { email: uniqueEmail('adm'), role: 'admin' });
  await assert.rejects(O.revokeInvitation(a.db, inv.id, 'admin'), /cannot cancel/);
  await O.revokeInvitation(a.db, inv.id, 'owner');
});

test('F-17 image cleanup never deletes an image that is in use or new', async () => {
  const s = await setup();
  const { rows } = await ownerQuery(
    `insert into images (org_id, kind, hash, width, height, bytes, variants, created_by, created_at)
     values ($1, 'item', $2, 1, 1, 1, '{}'::jsonb, $3, now()) returning id`, [s.org.id, 'f'.repeat(64), s.user.id]);
  const { getPool } = await import('../lib/db.js');
  assert.equal((await getPool().query("select delete_image($1, interval '1 day') as d", [rows[0].id])).rows[0].d, false, 'too new');
  await ownerQuery("update images set created_at = now() - interval '2 days' where id = $1", [rows[0].id]);
  await s.m.updateItem(s.db, s.item.id, { imageId: rows[0].id });
  assert.equal((await getPool().query("select delete_image($1, interval '1 day') as d", [rows[0].id])).rows[0].d, false, 'in use');
  await s.m.updateItem(s.db, s.item.id, { imageId: null });
  assert.equal((await getPool().query("select delete_image($1, interval '1 day') as d", [rows[0].id])).rows[0].d, true);
});
