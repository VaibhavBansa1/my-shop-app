import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, closePool, uniqueEmail, ownerQuery } from './helpers.js';

before(setupDb);
after(closePool);

test('signup, login, session lookup, logout, password change', async () => {
  const A = await import('../lib/services/accounts.js');
  const S = await import('../lib/auth/session.js');
  const email = uniqueEmail();
  const { user, session } = await A.signup({ name: 'Asha', email, password: 'a very long password' }, { ip: 'a1' });
  await assert.rejects(A.signup({ name: 'Asha', email, password: 'a very long password' }, { ip: 'a1' }), /already exists/);
  const found = await S.getSessionUser(session.token);
  assert.equal(found.user.id, user.id);
  const { rows } = await ownerQuery('select token_hash, password_hash from sessions join users on users.id = sessions.user_id where users.email = $1', [email]);
  assert.ok(!rows[0].password_hash.includes('a very long password'));
  assert.notEqual(rows[0].token_hash.toString('base64url'), session.token);

  await assert.rejects(A.login({ email, password: 'wrong password!!' }, { ip: 'a1' }), /incorrect/);
  await assert.rejects(A.login({ email: uniqueEmail(), password: 'whatever pass' }, { ip: 'a1' }), /incorrect/);
  const l2 = await A.login({ email, password: 'a very long password' }, { ip: 'a1' });

  await A.changePassword(user.id, { currentPassword: 'a very long password', newPassword: 'new long password 1' }, found.tokenHash);
  assert.ok(await S.getSessionUser(session.token), 'current session kept');
  assert.equal(await S.getSessionUser(l2.session.token), null, 'other sessions revoked');

  await S.deleteSession(found.tokenHash);
  assert.equal(await S.getSessionUser(session.token), null);
  assert.equal(await S.getSessionUser('short'), null);
});

test('login is throttled after repeated failures', async () => {
  const A = await import('../lib/services/accounts.js');
  const email = uniqueEmail();
  await A.signup({ name: 'B', email, password: 'a very long password' }, { ip: 'b1' });
  for (let i = 0; i < 10; i++) await assert.rejects(A.login({ email, password: 'nope nope nope' }, { ip: 'b1' }));
  await assert.rejects(A.login({ email, password: 'a very long password' }, { ip: 'b1' }), /Too many/);
});
