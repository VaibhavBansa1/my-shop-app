import test from 'node:test';
import assert from 'node:assert/strict';
import { readBodyLimited, readJson } from '../lib/http.js';

function streamingRequest(chunks, headers = {}) {
  let i = 0;
  const body = new ReadableStream({ pull(c) { if (i < chunks.length) c.enqueue(chunks[i++]); else c.close(); } });
  return new Request('http://x/', { method: 'POST', body, headers, duplex: 'half' });
}

test('body limit holds for chunked uploads without Content-Length', async () => {
  const big = Array.from({ length: 20 }, () => new Uint8Array(100_000));
  await assert.rejects(readBodyLimited(streamingRequest(big), 1_000_000), /too large/);
  const ok = await readBodyLimited(streamingRequest([new Uint8Array([1, 2]), new Uint8Array([3])]), 10);
  assert.deepEqual([...ok], [1, 2, 3]);
});

test('declared Content-Length over the limit is refused before reading', async () => {
  const req = new Request('http://x/', { method: 'POST', body: 'x', headers: { 'content-length': '999999999' } });
  await assert.rejects(readBodyLimited(req, 100), /too large/);
});

test('readJson: content type, size and syntax', async () => {
  await assert.rejects(readJson(new Request('http://x/', { method: 'POST', body: '{}', headers: { 'content-type': 'text/plain' } })), /Content-Type/);
  await assert.rejects(readJson(new Request('http://x/', { method: 'POST', body: '{bad', headers: { 'content-type': 'application/json' } })), /valid JSON/);
  const huge = JSON.stringify({ a: 'x'.repeat(300 * 1024) });
  await assert.rejects(readJson(streamingRequest([new TextEncoder().encode(huge)], { 'content-type': 'application/json' })), /too large/);
  assert.deepEqual(await readJson(new Request('http://x/', { method: 'POST', body: '{"a":1}', headers: { 'content-type': 'application/json' } })), { a: 1 });
});

test('email links never come from the Host header in production', async () => {
  const { publicOrigin } = await import('../lib/http.js');
  const req = new Request('http://evil.example/api/v1/auth/password-reset/request', { method: 'POST' });
  const saved = { origin: process.env.APP_ORIGIN, env: process.env.NODE_ENV };
  try {
    process.env.APP_ORIGIN = 'https://shop.example.in, https://www.shop.example.in';
    assert.equal(publicOrigin(req), 'https://shop.example.in');
    delete process.env.APP_ORIGIN;
    process.env.NODE_ENV = 'production';
    assert.throws(() => publicOrigin(req), /APP_ORIGIN/);
    process.env.NODE_ENV = 'development';
    assert.equal(publicOrigin(req), 'http://evil.example', 'dev fallback only');
  } finally {
    if (saved.origin === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = saved.origin;
    process.env.NODE_ENV = saved.env;
  }
});

test('names reject line breaks and control characters', async () => {
  const { orgCreateSchema, signupSchema, ledgerSchema } = await import('../lib/validation.js');
  assert.throws(() => orgCreateSchema.parse({ name: 'Shop\r\nBcc: victim@example.com' }), /line breaks/);
  assert.throws(() => signupSchema.parse({ name: 'A\u0000B', email: 'a@b.co', password: '0123456789' }), /line breaks/);
  assert.throws(() => ledgerSchema.parse({ name: 'X Y', groupId: '00000000-0000-4000-8000-000000000000' }), /line breaks/);
  assert.equal(orgCreateSchema.parse({ name: '  शर्मा किराना & Sons  ' }).name, 'शर्मा किराना & Sons');
});
