import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, closePool, uniqueEmail, ownerQuery } from './helpers.js';

process.env.EMAIL_CAPTURE = '1';
before(setupDb);
after(closePool);

const linkToken = (text) => text.match(/\/reset#([A-Za-z0-9_-]+)/)[1];

test('reset: unknown email looks the same, token works once, sessions are revoked', async () => {
  const A = await import('../lib/services/accounts.js');
  const R = await import('../lib/services/passwordReset.js');
  const S = await import('../lib/auth/session.js');
  const { takeSentEmails } = await import('../lib/email.js');
  takeSentEmails();
  const email = uniqueEmail('reset');
  const { session } = await A.signup({ name: 'Rita', email, password: 'original password 1' }, { ip: 'r1' });

  await R.requestReset(uniqueEmail('nobody'), { origin: 'https://shop.example' });
  assert.equal(takeSentEmails().length, 0, 'no email for unknown address (and no error)');

  await R.requestReset(email, { origin: 'https://shop.example' });
  const [mail] = takeSentEmails();
  assert.equal(mail.to, email);
  assert.ok(mail.text.includes('https://shop.example/reset#'));
  const token = linkToken(mail.text);
  const { rows } = await ownerQuery('select token_hash from password_resets');
  assert.ok(rows.every((r) => r.token_hash.toString('base64url') !== token), 'only a hash is stored');

  await assert.rejects(R.confirmReset('x'.repeat(43), 'new password here 1'), /invalid/);
  await R.confirmReset(token, 'brand new password 2');
  await assert.rejects(R.confirmReset(token, 'another password 3'), /invalid, already used/);
  assert.equal(await S.getSessionUser(session.token), null, 'old sessions signed out');
  await assert.rejects(A.login({ email, password: 'original password 1' }, { ip: 'r1' }), /incorrect/);
  assert.ok(await A.login({ email, password: 'brand new password 2' }, { ip: 'r1' }));
});

test('reset: expired links fail; requests are rate limited per email', async () => {
  const A = await import('../lib/services/accounts.js');
  const R = await import('../lib/services/passwordReset.js');
  const { takeSentEmails } = await import('../lib/email.js');
  takeSentEmails();
  const email = uniqueEmail('reset2');
  await A.signup({ name: 'Ravi', email, password: 'original password 1' }, { ip: 'r2' });
  await R.requestReset(email, { origin: 'https://s' });
  const token = linkToken(takeSentEmails()[0].text);
  await ownerQuery("update password_resets set expires_at = now() - interval '1 minute'");
  await assert.rejects(R.confirmReset(token, 'brand new password 2'), /expired/);
  await R.requestReset(email, { origin: 'https://s' });
  await R.requestReset(email, { origin: 'https://s' });
  await assert.rejects(R.requestReset(email, { origin: 'https://s' }), /Too many/);
});
