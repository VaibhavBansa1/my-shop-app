import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setupDb, makeUserOrg, closePool } from './helpers.js';

before(setupDb);
after(async () => {
  const { shutdownOcr } = await import('../lib/services/ocr.js');
  await shutdownOcr();
  await closePool();
});

const sample = readFileSync(new URL('./fixtures/invoice-sample.png', import.meta.url));

test('image checks: type sniffing, decompression-bomb guard, size limits', async () => {
  const { inspectImage, checkImage } = await import('../lib/services/ocr.js');
  assert.deepEqual(inspectImage(sample), { type: 'png', width: 900, height: 640 });
  assert.throws(() => inspectImage(Buffer.from('GIF89a........................')), /JPEG or PNG/);
  assert.throws(() => inspectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), /JPEG or PNG/);
  const bomb = Buffer.from(sample);
  bomb.writeUInt32BE(50000, 16); bomb.writeUInt32BE(50000, 20);
  assert.throws(() => checkImage(bomb), /resolution/);
  const tiny = Buffer.from(sample);
  tiny.writeUInt32BE(50, 16); tiny.writeUInt32BE(50, 20);
  assert.throws(() => checkImage(tiny), /too small/);
  assert.throws(() => checkImage(Buffer.alloc(9 * 1024 * 1024, 1)), /too large/);
  // Minimal JPEG header with SOF0 600x800
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x20, 0x02, 0x58,
    0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0, 0, 0]);
  assert.deepEqual(inspectImage(jpg), { type: 'jpeg', width: 600, height: 800 });
});

test('OCR + parse + match against the organization masters', async () => {
  const { recognize, draftFromText } = await import('../lib/services/ocr.js');
  const m = await import('../lib/services/masters.js');
  const { db } = await makeUserOrg();
  const groups = await m.listGroups(db);
  const pcs = (await m.listUnits(db)).find((u) => u.symbol === 'pcs').id;
  const supplier = await m.createLedger(db, { name: 'Annapurna Wholesale', groupId: groups.find((g) => g.code === 'sundry_creditors').id,
    openingBalance: 0, gstin: '23AAACR5055K1ZF', phone: '', email: '', address: '', isActive: true });
  const rice = await m.createItem(db, { name: 'Basmati Rice 5 kg', sku: '', unitId: pcs, hsnCode: '1006', gstRate: 5, isActive: true });
  await m.createItem(db, { name: 'Mustard Oil 1 Litre', sku: '', unitId: pcs, hsnCode: '1514', gstRate: 5, isActive: true });

  const { text, confidence } = await recognize(sample);
  assert.ok(confidence > 60, `OCR confidence ${confidence}`);
  const d = await draftFromText(db, text, { engine: 'server-tesseract', confidence });
  assert.equal(d.supplierGstin, '23AAACR5055K1ZF');
  assert.equal(d.supplier?.ledgerId, supplier.id);
  assert.equal(d.invoiceNumber, 'AW/2026/0457');
  assert.equal(d.invoiceDate, '2026-11-03');
  assert.equal(d.totals.total, 10295);
  assert.equal(d.items.length, 3);
  assert.equal(d.items[0].match?.stockItemId, rice.id, 'rice matched by name + HSN');
  assert.ok(d.items[1].match, 'oil matched');
  assert.equal(d.items[2].match, null, 'sugar is not in masters -> no forced match');
});

test('draft is tenant-scoped: another org does not see this supplier', async () => {
  const { draftFromText } = await import('../lib/services/ocr.js');
  const m = await import('../lib/services/masters.js');
  const a = await makeUserOrg();
  const b = await makeUserOrg();
  const groups = await m.listGroups(a.db);
  await m.createLedger(a.db, { name: 'Supplier A', groupId: groups.find((g) => g.code === 'sundry_creditors').id,
    openingBalance: 0, gstin: '27AAACR5055K1Z7', phone: '', email: '', address: '', isActive: true });
  const d = await draftFromText(b.db, 'GSTIN 27AAACR5055K1Z7\nTotal 100');
  assert.equal(d.supplierGstin, '27AAACR5055K1Z7');
  assert.equal(d.supplier, null);
});
