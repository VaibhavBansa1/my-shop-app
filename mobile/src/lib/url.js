// Pure helper (no native imports) so it can be unit-tested in Node.
/** Accept https anywhere; plain http only for local/LAN addresses during development. */
export function validateServerUrl(input) {
  let u;
  try { u = new URL(String(input).trim()); } catch { return { ok: false, error: 'Enter a full address like https://shop.example.com' }; }
  if (u.username || u.password) return { ok: false, error: 'The address must not contain a username or password.' };
  const local = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) {
    return { ok: false, error: 'Use an https:// address (http is only allowed for a computer on your own Wi-Fi).' };
  }
  return { ok: true, url: `${u.protocol}//${u.host}` };
}

