// Two-step login: setup, sign-in with code, replay refusal, recovery codes, limits, turning it off, enforcement.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, closePool, uniqueEmail, makeUserOrg } from './helpers.js';
import { hotp, stepAt, base32Encode, verifyTotp } from '../lib/auth/totp.js';

before(setupDb);
after(closePool);
const PW = 'correct horse battery';

test('TOTP matches the RFC 6238 test vectors and refuses replays', () => {
  const s = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(hotp(s, 1), '287082');                      // T = 59 s
  assert.equal(hotp(s, Math.floor(1111111109 / 30)), '081804');
  const now = 1_800_000_000_000; const code = hotp(s, stepAt(now));
  const step = verifyTotp(s, code, { now });
  assert.equal(step, stepAt(now));
  assert.equal(verifyTotp(s, code, { now, lastStep: step }), null, 'same code twice is refused');
  assert.equal(verifyTotp(s, '000000', { now }), code === '000000' ? step : null);
});

test('two-step login: setup, sign in, recovery code once, wrong-code limit, turn off', async () => {
  const { signup, login } = await import('../lib/services/accounts.js');
  const TF = await import('../lib/services/twoFactor.js');
  const { ownerQuery } = await import('./helpers.js');
  const email = uniqueEmail('mfa');
  const { user } = await signup({ name: 'Mfa', email, password: PW }, { ip: 'mfa1' });
  await assert.rejects(TF.startSetup(user.id, 'wrong password'), /Password is incorrect/);
  const { secret, uri } = await TF.startSetup(user.id, PW);
  assert.match(uri, /^otpauth:\/\/totp\/.+secret=/);
  assert.equal((await TF.twoFactorStatus(user.id)).enabled, false, 'not active before a code proves the app has it');
  const { recoveryCodes } = await TF.enableTwoFactor(user.id, hotp(secret, stepAt()));
  assert.equal(recoveryCodes.length, 10);
  assert.deepEqual(await TF.twoFactorStatus(user.id).then((s) => [s.enabled, s.recoveryCodesLeft]), [true, 10]);
  const stored = (await ownerQuery('select totp_secret from users where id = $1', [user.id])).rows[0].totp_secret;
  assert.ok(stored.startsWith('enc:v1:') && !stored.includes(secret), 'secret stored encrypted');

  await assert.rejects(login({ email, password: PW }, {}), (e) => e.code === 'mfa_required');
  // The code used to enable is already spent; the next step's code works.
  const next = hotp(secret, stepAt() + 1);
  const ok = await login({ email, password: PW, code: next }, {});
  assert.equal(ok.secondFactor, 'totp');
  await assert.rejects(login({ email, password: PW, code: next }, {}), (e) => e.code === 'mfa_invalid', 'code replay refused');

  const rc = recoveryCodes[0];
  assert.equal((await login({ email, password: PW, code: rc.toUpperCase() }, {})).secondFactor, 'recovery');
  await assert.rejects(login({ email, password: PW, code: rc }, {}), /already used/);
  assert.equal((await TF.twoFactorStatus(user.id)).recoveryCodesLeft, 9);

  for (let i = 0; i < 3; i++) await assert.rejects(login({ email, password: PW, code: '000001' }, {}));
  await assert.rejects(login({ email, password: PW, code: hotp(secret, stepAt() - 1) }, {}), /Too many/, '5 wrong second-step tries per 15 minutes');

  const email2 = uniqueEmail('mfa2');
  const u2 = (await signup({ name: 'Mfa2', email: email2, password: PW }, { ip: 'mfa2' })).user;
  const s2 = (await TF.startSetup(u2.id, PW)).secret;
  const codes2 = (await TF.enableTwoFactor(u2.id, hotp(s2, stepAt()))).recoveryCodes;
  await assert.rejects(TF.disableTwoFactor(u2.id, { password: 'nope nope', code: codes2[0] }), /Password is incorrect/);
  await TF.disableTwoFactor(u2.id, { password: PW, code: codes2[1] });
  assert.equal((await TF.twoFactorStatus(u2.id)).enabled, false);
  assert.ok((await login({ email: email2, password: PW }, {})).session);
});

test('REQUIRE_2FA_FOR_OWNERS blocks owner changes until two-step login is on, reads still work', async () => {
  const { route } = await import('../lib/http.js');
  const { createSession } = await import('../lib/auth/session.js');
  const { tx } = await import('../lib/db.js');
  const TF = await import('../lib/services/twoFactor.js');
  const a = await makeUserOrg();
  const { token } = await tx((c) => createSession(c, a.user.id, {}));
  const h = route(async () => ({ ok: true }), { action: 'org.read' });
  const call = (method) => h(new Request(`http://localhost/api/v1/orgs/${a.org.id}/x`, { method, headers: { authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) } }), { params: Promise.resolve({ orgId: a.org.id }) });
  process.env.REQUIRE_2FA_FOR_OWNERS = '1';
  try {
    assert.equal((await call('GET')).status, 200);
    const r = await call('POST');
    assert.equal(r.status, 403);
    assert.equal((await r.json()).error.code, 'mfa_setup_required');
    const { secret } = await TF.startSetup(a.user.id, 'correct horse battery');
    await TF.enableTwoFactor(a.user.id, hotp(secret, stepAt()));
    assert.equal((await call('POST')).status, 200);
  } finally { delete process.env.REQUIRE_2FA_FOR_OWNERS; }
});
