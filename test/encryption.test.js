import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, makeUserOrg, closePool } from './helpers.js';

before(setupDb);
after(closePool);

test('crypto: round trip, random IV, tamper detection, missing key rules', async () => {
  const C = await import('../lib/crypto.js');
  const a = C.encryptField('98765 43210');
  const b = C.encryptField('98765 43210');
  assert.ok(a.startsWith('enc:v1:') && a !== b, 'random IV: same text encrypts differently');
  assert.equal(C.decryptField(a), '98765 43210');
  assert.equal(C.encryptField(''), '');
  assert.equal(C.decryptField('plain legacy value'), 'plain legacy value');
  const t = a.slice(0, -3) + (a.endsWith('AAA') ? 'BBB' : 'AAA');
  assert.equal(C.decryptField(t), '[cannot decrypt]', 'tampering detected (GCM tag)');
  const saved = { k: process.env.DATA_ENCRYPTION_KEY, e: process.env.NODE_ENV };
  try {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
    assert.equal(C.decryptField(a), '[cannot decrypt]', 'wrong key cannot read');
    process.env.DATA_ENCRYPTION_KEY = 'short';
    assert.throws(() => C.encryptField('x'), /32 bytes/);
    delete process.env.DATA_ENCRYPTION_KEY; process.env.NODE_ENV = 'production';
    assert.throws(() => C.encryptField('x'), /required in production/);
  } finally { process.env.DATA_ENCRYPTION_KEY = saved.k; process.env.NODE_ENV = saved.e; }
});

test('contact details are ciphertext in the database and plain text through the app', async () => {
  const m = await import('../lib/services/masters.js');
  const { updateOrg, getOrg } = await import('../lib/services/orgs.js');
  const { exportOrganization } = await import('../lib/services/exportData.js');
  const { db, org } = await makeUserOrg();
  const groups = await m.listGroups(db);
  const l = await m.createLedger(db, { name: 'Ramesh', groupId: groups.find((g) => g.code === 'sundry_debtors').id,
    phone: '98765 43210', email: 'ramesh@example.com', address: '12 MG Road, Gwalior' });
  assert.equal(l.phone, '98765 43210');
  await updateOrg(db, { address: 'Main Market, Gwalior', phone: '0751-123456' });
  const { withOrg } = await import('../lib/db.js');
  const rawQ = (sql, p) => withOrg(db, (c) => c.query(sql, p));  // raw stored values (RLS stops even the table owner)
  const { rows } = await rawQ('select phone, email, address from ledgers where id = $1', [l.id]);
  for (const v of Object.values(rows[0])) assert.ok(v.startsWith('enc:v1:'), `stored encrypted: ${v.slice(0, 12)}`);
  const o = await rawQ('select address, phone from organizations where id = $1', [org.id]);
  assert.ok(o.rows[0].address.startsWith('enc:v1:') && o.rows[0].phone.startsWith('enc:v1:'));
  const raw = JSON.stringify((await rawQ('select * from ledgers where id = $1', [l.id])).rows);
  assert.ok(!raw.includes('98765') && !raw.includes('ramesh@') && !raw.includes('MG Road'));
  assert.equal((await m.getLedger(db, l.id)).address, '12 MG Road, Gwalior');
  assert.equal((await getOrg(db)).address, 'Main Market, Gwalior');
  const upd = await m.updateLedger(db, l.id, { phone: '91111 22222' });
  assert.equal(upd.phone, '91111 22222');
  const dump = await exportOrganization(db);
  assert.equal(dump.ledgers.find((x) => x.id === l.id).email, 'ramesh@example.com', 'backup is readable by the owner');
});
