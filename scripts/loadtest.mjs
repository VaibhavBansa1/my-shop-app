// Scale test: many organizations + one large one, then time every report.
// Usage (uses the TEST database, which it wipes):  node scripts/loadtest.mjs [orgs=200] [bigVouchers=30000]
import { performance } from 'node:perf_hooks';
import { setupDb, makeUserOrg, closePool } from '../test/helpers.js';

process.env.EMAIL_CAPTURE = '1';
process.env.EMAIL_VERIFICATION = 'off';
const { takeSentEmails } = await import('../lib/email.js');
setInterval(() => takeSentEmails(), 2000).unref();

const ORGS = Number(process.argv[2] || 200);
const BIG = Number(process.argv[3] || 30000);
const ms = (t) => `${(performance.now() - t).toFixed(0)} ms`;

await setupDb();
const { createVoucher } = await import('../lib/services/vouchers.js');
const m = await import('../lib/services/masters.js');
const R = await import('../lib/services/reports.js');
const { getPool } = await import('../lib/db.js');

async function seed(db, items = 20, parties = 30) {
  const groups = await m.listGroups(db);
  const g = (c) => groups.find((x) => x.code === c).id;
  const pcs = (await m.listUnits(db)).find((u) => u.symbol === 'pcs').id;
  const its = []; const cust = [];
  for (let i = 0; i < items; i++) its.push(await m.createItem(db, { name: `Item ${i}`, unitId: pcs, gstRate: [0, 5, 12, 18][i % 4], salePrice: 50 + i, purchasePrice: 40 + i, openingQty: 1000, openingRate: 40 + i, reorderLevel: 5 }));
  for (let i = 0; i < parties; i++) cust.push(await m.createLedger(db, { name: `Customer ${i}`, groupId: g('sundry_debtors'), openingBalance: 0, stateCode: i % 5 ? '23' : '07' }));
  const sup = await m.createLedger(db, { name: 'Main Supplier', groupId: g('sundry_creditors'), openingBalance: 0, stateCode: '23' });
  const L = await m.listLedgers(db);
  return { its, cust, sup, cash: L.find((l) => l.code === 'cash').id, rent: L.find((l) => l.code === 'rent').id };
}
function day(i) { const d = new Date(Date.UTC(2026, 3, 1) + (i % 210) * 86400000); return d.toISOString().slice(0, 10); }
async function vouchers(db, s, n, conc = 8) {
  let k = 0;
  const worker = async () => {
    while (k < n) {
      const i = k++;
      const r = i % 10;
      if (r < 7) await createVoucher(db, { type: 'sales', date: day(i), partyLedgerId: r < 3 ? s.cust[i % s.cust.length].id : null, reference: '', narration: '', roundOff: true,
        items: [{ stockItemId: s.its[i % s.its.length].id, qty: 1 + (i % 3), rate: 60 }, { stockItemId: s.its[(i + 7) % s.its.length].id, qty: 1, rate: 75 }], entries: [] });
      else if (r === 7) await createVoucher(db, { type: 'purchase', date: day(i), partyLedgerId: s.sup.id, reference: '', narration: '', roundOff: true, items: [{ stockItemId: s.its[i % s.its.length].id, qty: 20, rate: 41 }], entries: [] });
      else if (r === 8) await createVoucher(db, { type: 'receipt', date: day(i), reference: '', narration: '', items: [], entries: [{ ledgerId: s.cash, debit: 100 }, { ledgerId: s.cust[i % s.cust.length].id, credit: 100 }] });
      else await createVoucher(db, { type: 'payment', date: day(i), reference: '', narration: '', items: [], entries: [{ ledgerId: s.rent, debit: 50 }, { ledgerId: s.cash, credit: 50 }] });
    }
  };
  await Promise.all(Array.from({ length: conc }, worker));
}

let t = performance.now();
console.log(`seeding ${ORGS} small organizations x 50 vouchers…`);
for (let o = 0; o < ORGS; o++) {
  const { db } = await makeUserOrg({ booksFrom: '2026-04-01' });
  await vouchers(db, await seed(db, 5, 5), 50, 4);
}
console.log(`  done in ${ms(t)}`);

t = performance.now();
console.log(`seeding one large organization with ${BIG} vouchers…`);
const big = await makeUserOrg({ booksFrom: '2026-04-01' });
const s = await seed(big.db, 300, 500);
await vouchers(big.db, s, BIG, 8);
const secs = (performance.now() - t) / 1000;
console.log(`  done in ${secs.toFixed(1)} s (${(BIG / secs).toFixed(0)} vouchers/second with 8 parallel writers)`);

const small = await makeUserOrg({ booksFrom: '2026-04-01' });
await vouchers(small.db, await seed(small.db, 5, 5), 50, 2);

const { rows } = await getPool().query("select pg_size_pretty(pg_database_size(current_database())) as size");
console.log(`database size: ${rows[0].size}`);

async function time(label, fn, runs = 3) {
  await fn();
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) await fn();
  const avg = (performance.now() - t0) / runs;
  console.log(`  ${label.padEnd(34)} ${avg.toFixed(0).padStart(6)} ms`);
  return avg;
}
const results = {};
for (const [name, db] of [['large org', big.db], ['small org (same database)', small.db]]) {
  console.log(`report timings — ${name}:`);
  const r = {};
  r.dashboard = await time('dashboard', () => R.dashboard(db));
  r.trialBalance = await time('trial balance', () => R.trialBalance(db, { to: '2026-10-31' }));
  r.profitLoss = await time('profit & loss (full year)', () => R.profitLoss(db, { from: '2026-04-01', to: '2026-10-31' }));
  r.balanceSheet = await time('balance sheet', () => R.balanceSheet(db, { to: '2026-10-31' }));
  r.stockSummary = await time('stock summary', () => R.stockSummary(db, { to: '2026-10-31' }));
  r.gstSummary = await time('GST summary', () => R.gstSummary(db, { from: '2026-04-01', to: '2026-10-31' }));
  r.outstanding = await time('receivables', () => R.outstanding(db, { kind: 'receivable', to: '2026-10-31' }));
  r.dayBook = await time('day book (one day)', () => R.dayBook(db, { from: '2026-06-01', to: '2026-06-01' }));
  r.ledger = await time('ledger statement (customer)', () => R.ledgerStatement(db, s.cust[0].id, { from: '2026-04-01', to: '2026-10-31' }).catch(() => null));
  r.list = await time('voucher list (latest 100)', async () => (await import('../lib/services/vouchers.js')).listVouchers(db, { limit: 100 }));
  results[name] = r;
}
await closePool();
console.log(JSON.stringify(results));
