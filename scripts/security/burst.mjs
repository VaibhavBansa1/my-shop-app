// Short, bounded load run against a LOCAL server: N parallel clients for S seconds doing a realistic mix
// (sales bills, reports, lists), then one 5000-row import. Checks for 5xx errors and reports latency.
// Usage: node scripts/security/burst.mjs [clients=20] [seconds=20]
// One user sends ~100 requests/s here, far above API_RATE_PER_MIN (600/min): start the server with API_RATE_PER_MIN=0
// for this test, or most requests are (correctly) answered 429.
const BASE = process.env.BASE || 'http://localhost:3000';
const CLIENTS = Math.min(100, Number(process.argv[2] || 20));
const SECONDS = Math.min(120, Number(process.argv[3] || 20));   // hard cap: this is a smoke-level burst, not a soak
async function j(method, path, token, body, headers = {}) {
  const res = await fetch(BASE + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const em = `burst.${Date.now()}@example.com`;
const T = (await j('POST', '/api/v1/auth/signup', null, { name: 'Burst', email: em, password: 'burst password 123', returnToken: true })).data.token;
const org = (await j('POST', '/api/v1/orgs', T, { name: 'Burst Shop', gstin: '23ABCDE1234F1Z8', stateCode: '23' })).data;
const pcs = (await j('GET', `/api/v1/orgs/${org.id}/units`, T)).data.units.find((u) => u.symbol === 'pcs').id;
const item = (await j('POST', `/api/v1/orgs/${org.id}/items`, T, { name: 'Burst Item', unitId: pcs, salePrice: 10, gstRate: 18, openingQty: 1000000, openingRate: 5 })).data;
const today = new Date().toISOString().slice(0, 10);
const ops = [
  ['sale', () => j('POST', `/api/v1/orgs/${org.id}/vouchers`, T, { type: 'sales', date: today, items: [{ stockItemId: item.id, qty: 1, rate: 10 }] }, { 'idempotency-key': `b-${Math.random().toString(36).slice(2)}x` })],
  ['dashboard', () => j('GET', `/api/v1/orgs/${org.id}/reports/dashboard`, T)],
  ['trial-balance', () => j('GET', `/api/v1/orgs/${org.id}/reports/trial-balance`, T)],
  ['profit-loss', () => j('GET', `/api/v1/orgs/${org.id}/reports/profit-loss`, T)],
  ['vouchers', () => j('GET', `/api/v1/orgs/${org.id}/vouchers?limit=50`, T)],
];
const lat = {}; const statuses = {}; let total = 0;
const end = Date.now() + SECONDS * 1000;
await Promise.all(Array.from({ length: CLIENTS }, async (_, w) => {
  let i = w;
  while (Date.now() < end) {
    const [name, fn] = ops[i++ % ops.length];
    const t0 = performance.now(); const r = await fn(); const ms = performance.now() - t0;
    (lat[name] ??= []).push(ms); statuses[r.status] = (statuses[r.status] ?? 0) + 1; total++;
  }
}));
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(0); };
console.log(`${total} requests in ${SECONDS}s with ${CLIENTS} clients = ${(total / SECONDS).toFixed(0)}/s; statuses ${JSON.stringify(statuses)}`);
for (const [n, a] of Object.entries(lat)) console.log(`  ${n.padEnd(14)} n=${String(a.length).padStart(5)}  p50 ${pct(a, 0.5)} ms  p95 ${pct(a, 0.95)} ms  max ${pct(a, 1)} ms`);
const rows = Array.from({ length: 5000 }, (_, k) => ({ name: `Imported ${k}`, unit: 'pcs', sale_price: String(k % 500), gst_rate: '5', opening_qty: '3' }));
let t0 = performance.now();
const imp = await j('POST', `/api/v1/orgs/${org.id}/import/items`, T, { rows, dryRun: false });
console.log(`import 5000 items: status ${imp.status}, ${(performance.now() - t0).toFixed(0)} ms, imported ${imp.data?.imported ?? imp.data?.ready ?? JSON.stringify(imp.data?.error ?? '').slice(0, 80)}`);
t0 = performance.now();
const tb = await j('GET', `/api/v1/orgs/${org.id}/reports/trial-balance`, T);
console.log(`trial balance after burst: status ${tb.status}, ${(performance.now() - t0).toFixed(0)} ms, debits ${tb.data?.totalDebit} = credits ${tb.data?.totalCredit} (opening difference ${tb.data?.differenceInOpening}, expected: test stock has no capital entry)`);
const five = Object.entries(statuses).filter(([s]) => Number(s) >= 500).reduce((a, [, n]) => a + n, 0);
process.exit(five ? 1 : 0);
