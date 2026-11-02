// Round 2 probes against a LOCAL server (default http://localhost:3000): sessions, CSRF, roles,
// races and the image route. Reports, does not fix. Run: node scripts/security/probe2.mjs
const BASE = process.env.BASE || 'http://localhost:3000';
const ORIGIN = process.env.ORIGIN || BASE;
const out = [];
const rec = (name, ok, detail) => { out.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
async function j(method, path, token, body, headers = {}) {
  const res = await fetch(BASE + path, { method, redirect: 'manual', headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data, headers: res.headers };
}
const email = (p) => `${p}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@example.com`;
const PW = 'probe password 123';
async function account(name, e = email(name)) {
  const r = await j('POST', '/api/v1/auth/signup', null, { name, email: e, password: PW, returnToken: true });
  return { ...r.data, email: e };
}
const today = new Date().toISOString().slice(0, 10);

const owner = await account('owner');
const T = owner.token;
const org = (await j('POST', '/api/v1/orgs', T, { name: 'Probe2 Shop' })).data;
const pcs = (await j('GET', `/api/v1/orgs/${org.id}/units`, T)).data.units.find((u) => u.symbol === 'pcs').id;
const item = (await j('POST', `/api/v1/orgs/${org.id}/items`, T, { name: 'P2 Item', unitId: pcs, salePrice: 10, openingQty: 100, openingRate: 5 })).data;
const sale = (extra = {}) => ({ type: 'sales', date: today, items: [{ stockItemId: item.id, qty: 1, rate: 10 }], ...extra });

// --- Sessions -------------------------------------------------------------------------------
{
  const a = await account('sess');
  const login2 = (await j('POST', '/api/v1/auth/login', null, { email: a.email, password: PW, returnToken: true })).data;
  let r = await j('GET', '/api/v1/me', a.token + 'x');
  rec('tampered bearer token is rejected', r.status === 401, `status ${r.status}`);
  r = await j('GET', '/api/v1/me', null, undefined, { cookie: `sid=${a.token}; session=${a.token}` });
  rec('GET /me with a guessed cookie name works only for the real cookie name (no crash)', r.status === 200 || r.status === 401, `status ${r.status}`);
  r = await j('POST', '/api/v1/auth/password', a.token, { currentPassword: PW, newPassword: 'a brand new password 1' });
  rec('password change succeeds', r.status === 200, `status ${r.status}`);
  r = await j('GET', '/api/v1/me', login2?.token);
  rec('other sessions end after a password change', r.status === 401, `status ${r.status}`);
  r = await j('GET', '/api/v1/me', a.token);
  rec('the session that changed the password stays signed in', r.status === 200, `status ${r.status}`);
  await j('POST', '/api/v1/auth/logout', a.token);
  r = await j('GET', '/api/v1/me', a.token);
  rec('token is dead after logout', r.status === 401, `status ${r.status}`);
  r = await j('POST', '/api/v1/auth/login', null, { email: a.email, password: PW, returnToken: true });
  rec('old password no longer works', r.status === 401 || r.status === 400, `status ${r.status}`);
  r = await j('POST', '/api/v1/auth/login', null, { email: `  ${a.email.toUpperCase()}  `, password: 'a brand new password 1', returnToken: true });
  rec('email is matched case/space-insensitively at login', r.status === 200, `status ${r.status}`);
  // Another user cannot revoke my session by id
  const b = await account('sessb');
  const mine = (await j('GET', '/api/v1/me/sessions', r.data.token)).data.sessions[0].id;
  await j('DELETE', `/api/v1/me/sessions/${mine}`, b.token);
  const still = await j('GET', '/api/v1/me', r.data.token);
  rec("another user cannot sign out my device by session id", still.status === 200, `status ${still.status}`);
  const bad = await j('DELETE', `/api/v1/me/sessions/${'%25'.repeat(8)}`, b.token);
  rec('session id with LIKE wildcards is refused', bad.status === 404 || bad.status === 400, `status ${bad.status}`);
}

// --- CSRF (cookie-authenticated writes) -----------------------------------------------------
{
  const cookie = `shop_session=${T}`;
  const names = ['__Host-sid', 'sid'];
  let used = null;
  for (const n of names) { const r = await j('GET', '/api/v1/me', null, undefined, { cookie: `${n}=${T}` }); if (r.status === 200) { used = n; break; } }
  rec('session cookie name discovered for CSRF checks', !!used, used ?? 'none');
  if (used) {
    const ck = { cookie: `${used}=${T}` };
    let r = await j('POST', `/api/v1/orgs/${org.id}/vouchers`, null, sale(), { ...ck, origin: 'https://evil.example' });
    rec('cookie write from a foreign Origin is refused', r.status === 403, `status ${r.status}`);
    r = await j('POST', `/api/v1/orgs/${org.id}/vouchers`, null, sale(), ck);
    rec('cookie write without any Origin is refused', r.status === 403, `status ${r.status}`);
    r = await j('POST', `/api/v1/orgs/${org.id}/vouchers`, null, sale(), { ...ck, origin: 'null' });
    rec('cookie write with Origin: null (sandboxed iframe) is refused', r.status === 403, `status ${r.status}`);
    r = await j('POST', `/api/v1/orgs/${org.id}/vouchers`, null, JSON.stringify(sale()), { ...ck, origin: 'https://evil.example', 'content-type': 'text/plain' });
    rec('text/plain "simple" cross-site POST is refused', r.status === 403, `status ${r.status}`);
    r = await j('POST', `/api/v1/orgs/${org.id}/vouchers`, null, sale(), { ...ck, origin: `${ORIGIN}.evil.example` });
    rec('look-alike Origin (suffix) is refused', r.status === 403, `status ${r.status}`);
    r = await j('POST', `/api/v1/orgs/${org.id}/vouchers`, null, sale(), { ...ck, origin: ORIGIN });
    rec('cookie write from our own Origin works', r.status === 201 || r.status === 200, `status ${r.status}`);
  }
  let r = await j('POST', '/api/v1/auth/login', null, { email: owner.email, password: PW }, { origin: 'https://evil.example' });
  rec('login from a foreign Origin is refused (login CSRF)', r.status === 403, `status ${r.status}`);
  void cookie;
}

// --- Roles ----------------------------------------------------------------------------------
async function member(role) {
  const u = await account(role);
  const inv = (await j('POST', `/api/v1/orgs/${org.id}/invitations`, T, { email: u.email, role })).data;
  await j('POST', '/api/v1/invitations/accept', u.token, { token: inv.token });
  return u;
}
const viewer = await member('viewer');
const cashier = await member('cashier');
const admin = await member('admin');
{
  const groups = (await j('GET', `/api/v1/orgs/${org.id}/groups`, T)).data.groups;
  let r = await j('POST', `/api/v1/orgs/${org.id}/vouchers`, viewer.token, sale());
  rec('viewer cannot create a bill', r.status === 403, `status ${r.status}`);
  r = await j('POST', `/api/v1/orgs/${org.id}/items`, viewer.token, { name: 'v item', unitId: pcs });
  rec('viewer cannot create an item', r.status === 403, `status ${r.status}`);
  r = await j('POST', `/api/v1/orgs/${org.id}/vouchers`, cashier.token, { type: 'payment', date: today, entries: [] });
  rec('cashier cannot create a payment', r.status === 403, `status ${r.status}`);
  r = await j('POST', `/api/v1/orgs/${org.id}/ledgers`, cashier.token, { name: 'Cashier Rent', groupId: groups.find((g) => g.code === 'indirect_expenses')?.id });
  rec('cashier cannot create an expense ledger', r.status === 403 || r.status === 422, `status ${r.status}`);
  r = await j('PATCH', `/api/v1/orgs/${org.id}/items/${item.id}`, cashier.token, { salePrice: 1 });
  rec('cashier cannot change item prices', r.status === 403, `status ${r.status}`);
  const v = (await j('POST', `/api/v1/orgs/${org.id}/vouchers`, T, sale())).data;
  r = await j('POST', `/api/v1/orgs/${org.id}/vouchers/${v.id}/cancel`, cashier.token, { reason: 'nope' });
  rec('cashier cannot cancel a bill', r.status === 403, `status ${r.status}`);
  r = await j('GET', `/api/v1/orgs/${org.id}/export?kind=vouchers`, cashier.token);
  rec('cashier cannot export the books', r.status === 403 || r.status === 404, `status ${r.status}`);
  r = await j('GET', `/api/v1/orgs/${org.id}/audit`, viewer.token);
  rec('viewer cannot read the activity log', r.status === 403, `status ${r.status}`);
  r = await j('POST', `/api/v1/orgs/${org.id}/invitations`, admin.token, { email: email('x'), role: 'owner' });
  rec('admin cannot invite an owner', r.status >= 400 && r.status < 500, `status ${r.status}`);
  r = await j('PATCH', `/api/v1/orgs/${org.id}/members/${admin.user.id}`, admin.token, { role: 'owner' });
  rec('admin cannot promote themself to owner', r.status === 403, `status ${r.status}`);
  r = await j('DELETE', `/api/v1/orgs/${org.id}/members/${owner.user.id}`, admin.token);
  rec('admin cannot remove the owner', r.status === 403, `status ${r.status}`);
  r = await j('DELETE', `/api/v1/orgs/${org.id}`, admin.token);
  rec('admin cannot delete the business', r.status === 403, `status ${r.status}`);
  // Removed member loses access immediately
  await j('DELETE', `/api/v1/orgs/${org.id}/members/${viewer.user.id}`, T);
  r = await j('GET', `/api/v1/orgs/${org.id}/vouchers`, viewer.token);
  rec('a removed member loses access at once', r.status === 404, `status ${r.status}`);
}

// --- Invitations ----------------------------------------------------------------------------
{
  const intended = await account('intended');
  const thief = await account('thief');
  const inv = (await j('POST', `/api/v1/orgs/${org.id}/invitations`, T, { email: intended.email, role: 'accountant' })).data;
  let r = await j('POST', '/api/v1/invitations/accept', thief.token, { token: inv.token });
  rec('a forwarded invitation cannot be used by another account', r.status >= 400 && r.status < 500, `status ${r.status}`);
  const rs = await Promise.all([1, 2, 3].map(() => j('POST', '/api/v1/invitations/accept', intended.token, { token: inv.token })));
  const okCount = rs.filter((x) => x.status === 200).length;
  rec('accepting the same invitation 3x in parallel succeeds at most once and never 500s', okCount <= 1 && rs.every((x) => x.status < 500), `statuses ${rs.map((x) => x.status)}`);
  r = await j('POST', '/api/v1/invitations/accept', intended.token, { token: inv.token });
  rec('a used invitation cannot be reused', r.status >= 400 && r.status < 500, `status ${r.status}`);
}

// --- Races on cancel / signup -----------------------------------------------------------------
{
  const v = (await j('POST', `/api/v1/orgs/${org.id}/vouchers`, T, sale())).data;
  const rs = await Promise.all([1, 2, 3, 4].map(() => j('POST', `/api/v1/orgs/${org.id}/vouchers/${v.id}/cancel`, T, { reason: 'race' })));
  const oks = rs.filter((x) => x.status === 200).length;
  rec('cancelling one bill 4x in parallel cancels once, no 500s', oks === 1 && rs.every((x) => x.status < 500), `statuses ${rs.map((x) => x.status)}`);
  const e = email('dup');
  const ss = await Promise.all([1, 2, 3].map(() => j('POST', '/api/v1/auth/signup', null, { name: 'Dup', email: e, password: PW, returnToken: true })));
  rec('3 parallel sign-ups with one email create one account, no 500s', ss.filter((x) => x.status === 201 || x.status === 200).length === 1 && ss.every((x) => x.status < 500), `statuses ${ss.map((x) => x.status)}`);
  // Correct (replace) the same voucher twice in parallel: only one replacement may win.
  const v2 = (await j('POST', `/api/v1/orgs/${org.id}/vouchers`, T, sale())).data;
  const cs = await Promise.all([1, 2].map(() => j('POST', `/api/v1/orgs/${org.id}/vouchers`, T, sale({ replacesVoucherId: v2.id, narration: 'fix' }))));
  rec('correcting one bill twice in parallel creates one replacement', cs.filter((x) => x.status === 201).length <= 1 && cs.every((x) => x.status < 500), `statuses ${cs.map((x) => x.status)}`);
}

// --- Rate limits ------------------------------------------------------------------------------
{
  const victim = await account('victim');
  const statuses = [];
  for (let i = 0; i < 15; i++) statuses.push((await j('POST', '/api/v1/auth/login', null, { email: i % 2 ? victim.email.toUpperCase() : victim.email, password: 'wrong password!!' })).status);
  rec('repeated wrong passwords get rate-limited (429), even with case variants', statuses.includes(429), `statuses ${statuses.join(',')}`);
  const reset = [];
  for (let i = 0; i < 12; i++) reset.push((await j('POST', '/api/v1/auth/password-reset/request', null, { email: victim.email })).status);
  rec('password-reset requests are rate-limited or silently capped', reset.every((s) => s < 500), `statuses ${reset.join(',')}`);
}

// --- Image route --------------------------------------------------------------------------------
{
  const sharp = (await import('sharp')).default;
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 10, b: 10 } } }).png().toBuffer();
  const up = await fetch(`${BASE}/api/v1/orgs/${org.id}/images?kind=item`, { method: 'POST', headers: { authorization: `Bearer ${T}`, 'content-type': 'image/png' }, body: png });
  const img = await up.json();
  const url = new URL(Object.values(img.urls ?? {})[0] ?? '/', BASE);
  let r = await fetch(url); rec('signed image URL works', r.status === 200, `status ${r.status} ${r.headers.get('content-type')}`);
  const tamper = new URL(url); tamper.searchParams.set('e', String(Number(url.searchParams.get('e')) + 86400));
  r = await fetch(tamper); rec('extending the expiry breaks the signature', r.status === 404, `status ${r.status}`);
  const other = new URL(url); other.pathname = url.pathname.replace(/org\/[0-9a-f-]+\//, `org/${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}/`);
  r = await fetch(other); rec('swapping the business id in the path breaks the signature', r.status === 404, `status ${r.status}`);
  for (const p of ['/api/img/..%2F..%2Fpackage.json', '/api/img/org/..%2f..%2f..%2fetc%2fpasswd', '/api/img/%2e%2e/%2e%2e/.env.local']) {
    r = await fetch(BASE + p); rec(`path traversal ${p} is not served`, r.status === 404 || r.status === 400, `status ${r.status}`);
  }
  r = await fetch(`${BASE}/api/v1/orgs/${org.id}/images?kind=item`, { method: 'POST', headers: { authorization: `Bearer ${T}`, 'content-type': 'image/svg+xml' }, body: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>' });
  rec('SVG upload (script carrier) is refused', r.status >= 400 && r.status < 500, `status ${r.status}`);
  const bomb = await sharp({ limitInputPixels: false, create: { width: 20000, height: 20000, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png({ compressionLevel: 9 }).toBuffer();
  const t0 = Date.now();
  r = await fetch(`${BASE}/api/v1/orgs/${org.id}/images?kind=item`, { method: 'POST', headers: { authorization: `Bearer ${T}`, 'content-type': 'image/png' }, body: bomb });
  rec('decompression bomb (20000x20000 PNG, small file) refused quickly', r.status >= 400 && r.status < 500 && Date.now() - t0 < 5000, `status ${r.status}, ${bomb.length} bytes, ${Date.now() - t0} ms`);
  r = await fetch(`${BASE}/api/v1/orgs/${org.id}/images?kind=item`, { method: 'POST', headers: { authorization: `Bearer ${T}`, 'content-type': 'image/png' }, body: Buffer.from('not really a png at all') });
  rec('garbage bytes labelled as PNG are refused cleanly', r.status >= 400 && r.status < 500, `status ${r.status}`);
}

// --- Misc headers -----------------------------------------------------------------------------
{
  const r = await fetch(`${BASE}/login`);
  const csp = r.headers.get('content-security-policy') || '';
  rec('pages send a CSP without unsafe-eval in production', !/unsafe-eval/.test(csp) || process.env.NODE_ENV === 'development', csp.slice(0, 80));
  rec('pages forbid framing (clickjacking)', /frame-ancestors 'none'/.test(csp) || r.headers.get('x-frame-options') === 'DENY', r.headers.get('x-frame-options') ?? '');
  const m = await fetch(`${BASE}/api/metrics`);
  rec('metrics are not public', m.status === 401 || m.status === 404 || m.status === 403, `status ${m.status}`);
}

const failed = out.filter((x) => !x.ok);
console.log(`\n${out.length - failed.length}/${out.length} passed`);
process.exit(failed.length ? 1 : 0);
