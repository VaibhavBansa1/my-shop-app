import test, { before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, closePool, uniqueEmail } from './helpers.js';

process.env.EMAIL_CAPTURE = '1';
before(setupDb);
after(closePool);
afterEach(() => { delete process.env.EMAIL_VERIFICATION; });
const tokenFrom = (text) => text.match(/#([A-Za-z0-9_-]{20,})/)[1];

test('required verification: signup emails a link; unverified users cannot create or join a business', async () => {
  process.env.EMAIL_VERIFICATION = 'required';
  const A = await import('../lib/services/accounts.js');
  const O = await import('../lib/services/orgs.js');
  const V = await import('../lib/services/verification.js');
  const { takeSentEmails } = await import('../lib/email.js');
  takeSentEmails();
  const email = uniqueEmail('v');
  const { user } = await A.signup({ name: 'Vee', email, password: 'verify me please 1' }, { ip: 'v1', origin: 'https://shop.example' });
  const [mail] = takeSentEmails();
  assert.equal(mail.to, email);
  assert.match(mail.subject, /Confirm your email/);
  assert.ok(mail.html.includes('https://shop.example/verify#'));
  await assert.rejects(O.createOrg(user.id, { name: 'Shop', legalName: '', country: 'IN', currency: 'INR', address: '', phone: '', email: '', fyStartMonth: 4 }), /confirm your email/);
  await V.confirmVerification(tokenFrom(mail.text));
  assert.ok(await V.isVerified(user.id));
  assert.match(takeSentEmails()[0].subject, /Welcome/);
  await assert.rejects(V.confirmVerification(tokenFrom(mail.text)), /already used/);
  const org = await O.createOrg(user.id, { name: 'Shop', legalName: '', country: 'IN', currency: 'INR', address: '', phone: '', email: '', fyStartMonth: 4 });
  assert.ok(org.id);
});

test('invitation is emailed with the link; html escapes names', async () => {
  process.env.EMAIL_VERIFICATION = 'off';
  const A = await import('../lib/services/accounts.js');
  const O = await import('../lib/services/orgs.js');
  const { takeSentEmails } = await import('../lib/email.js');
  const { user } = await A.signup({ name: '<b>Boss</b>', email: uniqueEmail('boss'), password: 'boss password 123' }, { ip: 'v2' });
  const org = await O.createOrg(user.id, { name: 'Tom & Jerry <Store>', legalName: '', country: 'IN', currency: 'INR', address: '', phone: '', email: '', fyStartMonth: 4 });
  takeSentEmails();
  const to = uniqueEmail('staff');
  const inv = await O.inviteMember({ userId: user.id, orgId: org.id }, 'owner', { email: to, role: 'cashier' }, { origin: 'https://shop.example' });
  const [mail] = takeSentEmails();
  assert.equal(mail.to, to);
  assert.ok(mail.text.includes(`https://shop.example/invite#${inv.token}`));
  assert.ok(mail.html.includes('Tom &amp; Jerry &lt;Store&gt;') && !mail.html.includes('<b>Boss</b>'));
  assert.equal(inv.emailed, true);
});

test('verification off: no gate, welcome email instead; resend is rate limited when on', async () => {
  process.env.EMAIL_VERIFICATION = 'off';
  const A = await import('../lib/services/accounts.js');
  const V = await import('../lib/services/verification.js');
  const { takeSentEmails } = await import('../lib/email.js');
  takeSentEmails();
  const { user } = await A.signup({ name: 'Off', email: uniqueEmail('off'), password: 'no verification 1' }, { ip: 'v3' });
  await new Promise((r) => setTimeout(r, 50));
  assert.match(takeSentEmails()[0].subject, /Welcome/);
  await V.requireVerified(user.id); // does not throw
  process.env.EMAIL_VERIFICATION = 'required';
  for (let i = 0; i < 5; i++) await V.sendVerification(user.id, 'https://s');
  await assert.rejects(V.sendVerification(user.id, 'https://s'), /Too many/);
});
