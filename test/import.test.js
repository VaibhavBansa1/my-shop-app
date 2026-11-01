import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, makeUserOrg, closePool } from './helpers.js';
import { parseCsv, csvToObjects, toCsv } from '../shared/csv.js';

before(setupDb);
after(closePool);

test('CSV parser: quotes, commas, CRLF, BOM, blank lines, round trip', () => {
  const text = '﻿Name,Sale Price,Notes\r\n"Rice, Basmati",510,"He said ""hi"""\r\n\r\nSugar,48,\nOil 1L , 170 ,"multi\nline"';
  assert.deepEqual(parseCsv(text), [['Name', 'Sale Price', 'Notes'], ['Rice, Basmati', '510', 'He said "hi"'], ['Sugar', '48', ''], ['Oil 1L ', ' 170 ', 'multi\nline']]);
  const objs = csvToObjects(text);
  assert.deepEqual(objs[0], { name: 'Rice, Basmati', sale_price: '510', notes: 'He said "hi"' });
  assert.deepEqual(csvToObjects(toCsv([['a', 'b'], ['x,y', '=1+1']])), [{ a: 'x,y', b: "'=1+1" }]);
  assert.throws(() => parseCsv('a\n'.repeat(20), { maxRows: 10 }), /more than 10 rows/);
});

test('items import: preview reports every bad row; nothing is saved until all rows are valid', async () => {
  const { importRows } = await import('../lib/services/importData.js');
  const m = await import('../lib/services/masters.js');
  const { db } = await makeUserOrg();
  await m.createItem(db, { name: 'Existing Pen', unitId: (await m.listUnits(db)).find((u) => u.symbol === 'pcs').id });
  const rows = csvToObjects([
    'Item Name,Unit,HSN,GST,Price,Cost,Opening Stock,Reorder',
    'Basmati Rice 5kg,pcs,1006,5,510,420,24,8',
    'Sugar,kg,1701,5,"1,048.50",42,12.5,5',
    'Bad Unit Thing,crates,,,10,5,1,',
    'Sugar,kg,1701,5,48,42,1,1',
    'Existing Pen,pcs,,,10,5,0,0',
    ',pcs,,,1,1,1,1',
    'Negative,pcs,,,1,1,-3,0',
  ].join('\n'));
  const r = await importRows(db, 'items', rows, { dryRun: true });
  assert.equal(r.total, 7);
  assert.equal(r.ready, 2);
  assert.deepEqual(r.errors.map((e) => e.line), [4, 5, 6, 7, 8]);
  assert.match(r.errors.find((e) => e.line === 4).error, /Unknown unit "crates"/);
  assert.match(r.errors.find((e) => e.line === 5).error, /twice/);
  assert.match(r.errors.find((e) => e.line === 6).error, /already exists/);
  // Even with dryRun false, errors mean nothing is saved.
  const r2 = await importRows(db, 'items', rows, { dryRun: false });
  assert.equal(r2.imported, 0);
  assert.equal((await m.listItems(db)).length, 1);
  // Fix the file: keep the good rows, skip existing.
  const good = [rows[0], rows[1], rows[4]];
  const r3 = await importRows(db, 'items', good, { dryRun: false, skipExisting: true });
  assert.equal(r3.imported, 2);
  assert.equal(r3.skipped, 1);
  const items = await m.listItems(db);
  const sugar = items.find((i) => i.name === 'Sugar');
  assert.equal(sugar.salePrice, 1048.5);
  assert.equal(sugar.stockQty, 12.5);
  assert.equal(items.find((i) => i.name === 'Basmati Rice 5kg').openingRate, 420, 'opening rate defaults to cost');
});

test('parties import: customers owe you, suppliers are owed; GSTIN checked; contacts encrypted', async () => {
  const { importRows } = await import('../lib/services/importData.js');
  const m = await import('../lib/services/masters.js');
  const { withOrg } = await import('../lib/db.js');
  const { db } = await makeUserOrg();
  const rows = csvToObjects([
    'Name,Type,Mobile,Email,GSTIN,State,Address,Balance',
    'Ramesh Traders,customer,98765 43210,ramesh@example.com,,23,"MG Road, Gwalior",1500',
    'Annapurna Wholesale,supplier,,,23AAACR5055K1ZF,23,,"2,000"',
    'Typo GSTIN,supplier,,,23AAACR5055K1Z1,,,0',
    'Odd Type,friend,,,,,,0',
  ].join('\n'));
  const r = await importRows(db, 'parties', rows, { dryRun: true });
  assert.deepEqual(r.errors.map((e) => e.line), [4, 5]);
  assert.match(r.errors[0].error, /GSTIN/);
  const ok = await importRows(db, 'parties', rows.slice(0, 2), { dryRun: false });
  assert.equal(ok.imported, 2);
  const L = await m.listLedgers(db);
  const cust = L.find((l) => l.name === 'Ramesh Traders');
  const sup = L.find((l) => l.name === 'Annapurna Wholesale');
  assert.equal(cust.groupCode, 'sundry_debtors'); assert.equal(cust.openingBalance, 1500);
  assert.equal(sup.groupCode, 'sundry_creditors'); assert.equal(sup.openingBalance, -2000);
  assert.equal(cust.address, 'MG Road, Gwalior');
  const raw = await withOrg(db, (c) => c.query('select phone from ledgers where id = $1', [cust.id]));
  assert.ok(raw.rows[0].phone.startsWith('enc:v1:'), 'imported contact details are encrypted too');
});

test('import limits and kinds', async () => {
  const { importRows } = await import('../lib/services/importData.js');
  const { db } = await makeUserOrg();
  await assert.rejects(importRows(db, 'items', []), /no data rows/);
  await assert.rejects(importRows(db, 'items', Array.from({ length: 5001 }, () => ({ name: 'x' }))), /at most 5000/);
  const r = await importRows(db, 'items', [{ name: '__proto__', unit: 'pcs' }, { name: 'constructor', unit: 'pcs' }], { dryRun: true });
  assert.equal(r.ready, 2, 'odd names are just names');
});
