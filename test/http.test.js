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
