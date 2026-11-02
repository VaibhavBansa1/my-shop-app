// Node tests for the app's pure modules (no React Native runtime needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateServerUrl } from '../src/lib/url.js';
import { invoiceHtml, esc } from '../src/lib/invoiceHtml.js';
import { computeInvoice } from '../../shared/gst.js';

test('server address: https anywhere, http only on local network', () => {
  assert.deepEqual(validateServerUrl('https://shop.example.com/some/path'), { ok: true, url: 'https://shop.example.com' });
  assert.equal(validateServerUrl('http://192.168.1.20:3000').ok, true);
  assert.equal(validateServerUrl('http://10.0.0.5:3000').ok, true);
  assert.equal(validateServerUrl('http://example.com').ok, false, 'plain http to the internet is refused');
  assert.equal(validateServerUrl('http://192.168.1.20.evil.com').ok, false);
  assert.equal(validateServerUrl('https://user:pw@example.com').ok, false);
  assert.equal(validateServerUrl('javascript:alert(1)').ok, false);
  assert.equal(validateServerUrl('not a url').ok, false);
});

test('invoice HTML escapes every user-provided value', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const html = invoiceHtml({ name: evil, legalName: '', address: '"><script>x()</script>', gstin: null }, {
    type: 'sales', label: 'INV/26-27/1', date: '2026-11-01', partyName: evil, placeOfSupply: '23', status: 'posted',
    items: [{ name: evil, hsnCode: '1006', qty: 1, unit: 'pcs', rate: 10, taxableValue: 10, gstRate: 0, cgst: 0, sgst: 0, igst: 0 }],
    entries: [], taxableTotal: 10, taxTotal: 0, roundOff: 0, total: 10, narration: evil,
  });
  assert.ok(!html.includes('<img'), 'no raw tags from data');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes("default-src 'none'"), 'print view has a restrictive CSP');
  assert.equal(esc(`a&b<'"`), 'a&amp;b&lt;&#39;&quot;');
});

test('the app previews totals with the exact server GST maths', () => {
  const inv = computeInvoice([{ qtyMilli: 2000, ratePaise: 51000, gstRateBp: 500 }, { qtyMilli: 3000, ratePaise: 8900, gstRateBp: 1800 }], { interState: false });
  assert.equal(inv.total, 138600); // Rs 1,386.00 — same invoice the website produced in the browser test
});

test('invoice logo URL is escaped and allowed only from its own origin', () => {
  const html = invoiceHtml({ name: 'S', gstin: null }, { type: 'sales', label: 'INV/1', date: '2026-11-01', status: 'posted', items: [], entries: [], total: 1, taxableTotal: 1, taxTotal: 0, roundOff: 0 },
    { logoUrl: 'https://shop.example.in/api/img/org/x/y.webp?e=1&s="><script>' });
  assert.ok(html.includes("img-src https://shop.example.in"));
  assert.ok(!html.includes('"><script>'));
});
