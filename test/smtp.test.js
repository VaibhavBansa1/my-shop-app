// Sends real mail over SMTP (nodemailer) to a tiny in-test SMTP server.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';

let server; let port; const received = [];
before(async () => {
  server = net.createServer((sock) => {
    let data = false; let buf = '';
    sock.write('220 test ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (data) {
          if (line === '.') { data = false; sock.write('250 OK queued\r\n'); } else received[received.length - 1].body += `${line}\n`;
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') sock.write('250-test\r\n250 OK\r\n');
        else if (cmd === 'MAIL') { received.push({ from: line, rcpt: [], body: '' }); sock.write('250 OK\r\n'); }
        else if (cmd === 'RCPT') { received[received.length - 1].rcpt.push(line); sock.write('250 OK\r\n'); }
        else if (cmd === 'DATA') { data = true; sock.write('354 go\r\n'); }
        else if (cmd === 'QUIT') { sock.end('221 bye\r\n'); }
        else sock.write('250 OK\r\n');
      }
    });
  }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  port = server.address().port;
  Object.assign(process.env, { EMAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), EMAIL_FROM: 'My Shop <no-reply@shop.test>' });
});
after(() => server.close());

test('SMTP delivery with escaped HTML and plain-text parts', async () => {
  const { sendEmail, emailProvider } = await import('../lib/email.js');
  const { inviteMessage } = await import('../lib/emailTemplates.js');
  assert.equal(emailProvider(), 'smtp');
  const r = await sendEmail({ to: 'staff@shop.test', ...inviteMessage('Tom & Jerry', 'Papa', 'cashier', 'https://shop.test/invite#abc') });
  assert.equal(r.ok, true);
  const msg = received.pop();
  assert.match(msg.rcpt[0], /staff@shop\.test/);
  assert.match(msg.body, /Subject: Papa invited you to Tom & Jerry/);
  assert.match(msg.body, /https:\/\/shop\.test\/invite#abc/);
  assert.match(msg.body, /Tom &amp; Jerry/, 'HTML part is escaped');
});

test('SMTP failure does not throw (sign-up must still work)', async () => {
  const { sendEmail } = await import('../lib/email.js');
  process.env.SMTP_PORT = '9';
  const r = await sendEmail({ to: 'x@y.z', subject: 's', text: 't' });
  assert.equal(r.ok, false);
});
