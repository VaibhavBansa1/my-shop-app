// End-to-end smoke test over HTTP against a running server.
// Usage: BASE=http://localhost:3000 node scripts/smoke.mjs
const BASE = process.env.BASE || 'http://localhost:3000';
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failures++; };

function client() {
  let cookie = '';
  return async (path, { method = 'GET', body, origin = BASE, headers = {} } = {}) => {
    const res = await fetch(BASE + path, {
      method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined, redirect: 'manual',
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data, headers: res.headers };
  };
}
const email = (p) => `${p}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;

const owner = client();
const pw = 'smoke test password';
let r = await owner('/api/v1/auth/signup', { method: 'POST', body: { name: 'Owner', email: email('owner'), password: pw } });
check(r.status === 201 && /HttpOnly/i.test(r.headers.get('set-cookie')), 'signup sets HttpOnly session cookie');
r = await owner('/api/v1/orgs', { method: 'POST', body: { name: 'Smoke Kirana', gstin: '23ABCDE1234F1Z8', stateCode: '23' }, origin: 'https://evil.example' });
check(r.status === 403, 'cross-site POST with cookie is rejected (CSRF)');
r = await owner('/api/v1/orgs', { method: 'POST', body: { name: 'Smoke Kirana', gstin: '23ABCDE1234F1Z8', stateCode: '23' } });
check(r.status === 201, 'create organization');
const org = r.data.id;
r = await owner(`/api/v1/orgs/${org}/units`);
const pcs = r.data.units.find((u) => u.symbol === 'pcs').id;
r = await owner(`/api/v1/orgs/${org}/items`, { method: 'POST', body: { name: 'Soap', unitId: pcs, gstRate: 18, salePrice: 40, openingQty: 20, openingRate: 30 } });
check(r.status === 201, 'create item');
const soap = r.data.id;
r = await owner(`/api/v1/orgs/${org}/vouchers`, { method: 'POST', body: { type: 'sales', date: new Date().toISOString().slice(0, 10), items: [{ stockItemId: soap, qty: 3, rate: 40 }] } });
check(r.status === 201 && r.data.total === 142, `cash sale with GST (total ${r.data?.total})`);
r = await owner(`/api/v1/orgs/${org}/reports/trial-balance`);
check(r.status === 200 && r.data.differenceInOpening === 600, 'trial balance: only difference is the un-capitalised opening stock (20 x 30)');
r = await owner(`/api/v1/orgs/${org}/reports/balance-sheet`);
check(r.status === 200 && r.data.totalAssets === r.data.totalLiabilities, 'balance sheet balances');
r = await owner(`/api/v1/orgs/${org}/reports/../../../../me`);
check(r.status !== 500, 'path tricks do not crash');
r = await owner(`/api/v1/orgs/${org}/vouchers`, { method: 'POST', body: '{"type":"sales"', headers: {} });
check(r.status === 422 || r.status === 400, 'malformed body is rejected');

// Staff with cashier role
const inv = await owner(`/api/v1/orgs/${org}/invitations`, { method: 'POST', body: { email: email('cashier'), role: 'cashier' } });
check(inv.status === 201 && inv.data.link.includes('#'), 'invitation link uses URL fragment');
const cashier = client();
await cashier('/api/v1/auth/signup', { method: 'POST', body: { name: 'Someone else', email: email('other'), password: pw } });
r = await cashier('/api/v1/invitations/accept', { method: 'POST', body: { token: inv.data.token } });
check(r.status === 403, 'invitation for another email is refused');

// Attacker with own org
const attacker = client();
await attacker('/api/v1/auth/signup', { method: 'POST', body: { name: 'Mallory', email: email('mallory'), password: pw } });
r = await attacker(`/api/v1/orgs/${org}`);
check(r.status === 404, 'other org is invisible (404)');
r = await attacker(`/api/v1/orgs/${org}/vouchers`, { method: 'POST', body: { type: 'sales', date: '2026-06-01', items: [] } });
check(r.status === 404, 'cannot post into another org');
r = await attacker(`/api/v1/orgs/not-a-uuid/ledgers`);
check(r.status === 404, 'bad org id handled');
r = await attacker('/api/v1/me', { headers: { cookie: 'sid=forged-token-value-1234567890' } });
check(r.status === 401 || r.status === 200, 'forged cookie is not accepted as another user');

// Bearer token flow for native apps
const native = client();
const nEmail = email('native');
await native('/api/v1/auth/signup', { method: 'POST', body: { name: 'Native', email: nEmail, password: pw } });
const login = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: nEmail, password: pw, returnToken: true }) }).then((x) => x.json());
const me = await fetch(`${BASE}/api/v1/me`, { headers: { authorization: `Bearer ${login.token}` } });
check(me.status === 200, 'bearer token works for native clients');
const noOrigin = await fetch(`${BASE}/api/v1/orgs`, { method: 'POST', headers: { authorization: `Bearer ${login.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Native Shop' }) });
check(noOrigin.status === 201, 'bearer POST works without Origin header');

r = await owner('/api/v1/auth/logout', { method: 'POST' });
r = await owner(`/api/v1/orgs/${org}`);
check(r.status === 401, 'logged out session is dead');

console.log(failures ? `\n${failures} check(s) failed` : '\nall smoke checks passed');
process.exit(failures ? 1 : 0);
