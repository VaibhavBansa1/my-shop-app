// Probes suspected weak spots against a LOCAL server (default http://localhost:3000). Reports, does not fix.
const BASE = process.env.BASE || 'http://localhost:3000';
const out = [];
const rec = (name, ok, detail) => { out.push({ name, ok, detail }); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
async function j(method, path, token, body, headers = {}) {
  const res = await fetch(BASE + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const email = (p) => `${p}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@example.com`;
async function account(name) {
  const r = await j('POST', '/api/v1/auth/signup', null, { name, email: email(name), password: 'probe password 123', returnToken: true });
  return r.data;
}

const owner = await account('owner');
const T = owner.token;
const org = (await j('POST', '/api/v1/orgs', T, { name: 'Probe Shop', gstin: '23ABCDE1234F1Z8', stateCode: '23' })).data;
const units = (await j('GET', `/api/v1/orgs/${org.id}/units`, T)).data.units;
const pcs = units.find((u) => u.symbol === 'pcs').id;
const item = (await j('POST', `/api/v1/orgs/${org.id}/items`, T, { name: 'Probe Item', unitId: pcs, salePrice: 10, openingQty: 100, openingRate: 5 })).data;
const sale = (extra) => ({ type: 'sales', date: new Date().toISOString().slice(0, 10), items: [{ stockItemId: item.id, qty: 1, rate: 10 }], ...extra });

// 1. Impossible calendar dates
let r = await j('POST', `/api/v1/orgs/${org.id}/vouchers`, T, sale({ date: '2026-02-30' }));
rec('impossible date 2026-02-30 is refused cleanly (4xx)', r.status >= 400 && r.status < 500, `status ${r.status}`);
// 2. NUL bytes in free text
r = await j('POST', `/api/v1/orgs/${org.id}/vouchers`, T, sale({ narration: 'abc\u0000def' }));
rec('NUL byte in narration refused cleanly (4xx)', r.status >= 400 && r.status < 500, `status ${r.status}`);
r = await j('POST', `/api/v1/orgs/${org.id}/ledgers`, T, { name: 'Nul Addr', groupId: (await j('GET', `/api/v1/orgs/${org.id}/groups`, T)).data.groups.find((g) => g.code === 'sundry_debtors').id, address: 'x\u0000y' });
rec('NUL byte in address refused cleanly (4xx)', r.status >= 400 && r.status < 500, `status ${r.status}`);
// 3. Numeric overflow
r = await j('POST', `/api/v1/orgs/${org.id}/vouchers`, T, sale({ items: [{ stockItemId: item.id, qty: '999999999999', rate: '999999999999' }] }));
rec('overflowing amounts refused cleanly (4xx)', r.status >= 400 && r.status < 500, `status ${r.status} ${r.data?.error?.message ?? ''}`);
// 4. Double submit (same request twice in parallel)
const before = (await j('GET', `/api/v1/orgs/${org.id}/vouchers`, T)).data.vouchers.length;
{ const k = `tap-${Date.now()}`; await Promise.all([1, 2].map(() => j('POST', `/api/v1/orgs/${org.id}/vouchers`, T, sale({ narration: 'double tap' }), { 'idempotency-key': k }))); }
const after = (await j('GET', `/api/v1/orgs/${org.id}/vouchers`, T)).data.vouchers.length;
rec('double-tap with the same Idempotency-Key creates one bill', after - before === 1, `created ${after - before}`);
// 5. Two owners demote each other at the same moment
const second = await account('owner2');
const inv = (await j('POST', `/api/v1/orgs/${org.id}/invitations`, T, { email: (await j('GET', '/api/v1/me', second.token)).data.user.email, role: 'admin' })).data;
await j('POST', '/api/v1/invitations/accept', second.token, { token: inv.token });
await j('PATCH', `/api/v1/orgs/${org.id}/members/${second.user.id}`, T, { role: 'owner' });
await Promise.all([
  j('PATCH', `/api/v1/orgs/${org.id}/members/${second.user.id}`, T, { role: 'admin' }),
  j('PATCH', `/api/v1/orgs/${org.id}/members/${owner.user.id}`, second.token, { role: 'admin' }),
]);
const members = (await j('GET', `/api/v1/orgs/${org.id}/members`, T)).data?.members ?? (await j('GET', `/api/v1/orgs/${org.id}/members`, second.token)).data?.members ?? [];
const owners = members.filter((m) => m.role === 'owner').length;
rec('concurrent demotions never leave a business without an owner', owners >= 1, `owners left: ${owners}`);
// 6. Prototype keys in import rows
r = await j('POST', `/api/v1/orgs/${org.id}/import/items`, T, '{"rows":[{"__proto__":"x","name":"Proto","unit":"pcs"},{"constructor":"y","name":"Ctor","unit":"pcs"}],"dryRun":true}');
rec('prototype-like keys in import are harmless', r.status === 200 && r.data.ready === 2, `status ${r.status} ready ${r.data?.ready}`);
// 7. OCR flood: many parallel uploads do not pile up without limit
const png = (await import('node:fs')).readFileSync(new URL('../../test/fixtures/invoice-sample.png', import.meta.url));
const t0 = Date.now();
const floods = await Promise.all(Array.from({ length: 20 }, () => fetch(`${BASE}/api/v1/orgs/${org.id}/ocr/invoice`, { method: 'POST', headers: { authorization: `Bearer ${T}`, 'content-type': 'image/png' }, body: png }).then((x) => x.status)));
const busy = floods.filter((s) => s === 503).length;
rec('OCR sheds load when too many photos are waiting (503 instead of an unbounded queue)', busy > 0, `statuses ${JSON.stringify(floods.reduce((a, s) => ({ ...a, [s]: (a[s] ?? 0) + 1 }), {}))} in ${Date.now() - t0} ms`);
// 8. Cross-business access with valid ids
const other = await account('mallory');
const oorg = (await j('POST', '/api/v1/orgs', other.token, { name: 'Mallory Shop' })).data;
const v = (await j('POST', `/api/v1/orgs/${org.id}/vouchers`, T, sale({}))).data;
r = await j('GET', `/api/v1/orgs/${oorg.id}/vouchers/${v.id}`, other.token);
rec("victim's voucher id inside attacker's own business is not found", r.status === 404, `status ${r.status}`);
r = await j('POST', `/api/v1/orgs/${oorg.id}/vouchers/${v.id}/cancel`, other.token, { reason: 'x' });
rec("cannot cancel another business's voucher via own business", r.status === 404, `status ${r.status}`);
r = await j('POST', `/api/v1/orgs/${oorg.id}/vouchers`, other.token, { type: 'sales', date: new Date().toISOString().slice(0, 10), items: [{ stockItemId: item.id, qty: 1, rate: 1 }] });
rec("cannot sell another business's stock item", r.status === 404 || r.status === 422, `status ${r.status}`);
// 9. Huge JSON arrays / nesting
r = await j('POST', `/api/v1/orgs/${org.id}/vouchers`, T, sale({ items: Array.from({ length: 5000 }, () => ({ stockItemId: item.id, qty: 1, rate: 1 })) }));
rec('oversized item list refused (4xx)', r.status >= 400 && r.status < 500, `status ${r.status}`);
r = await j('POST', `/api/v1/orgs/${org.id}/vouchers`, T, '['.repeat(100000) + ']'.repeat(100000));
rec('deeply nested JSON refused (4xx)', r.status >= 400 && r.status < 500, `status ${r.status}`);

const failed = out.filter((x) => !x.ok);
console.log(`\n${out.length - failed.length}/${out.length} passed`);
process.exit(failed.length ? 1 : 0);
