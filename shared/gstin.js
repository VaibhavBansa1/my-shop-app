// GSTIN: 2-digit state + 10-char PAN + entity digit + 'Z' (by convention) + checksum.
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;

/** Official mod-36 checksum character for the first 14 characters. */
export function gstinCheckChar(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]);
    if (v < 0) return null;
    const p = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export function isValidGstin(g) {
  if (typeof g !== 'string') return false;
  const s = g.trim().toUpperCase();
  return GSTIN_SHAPE.test(s) && gstinCheckChar(s.slice(0, 14)) === s[14];
}

/** Repair common OCR confusions in a 15-char candidate using the known GSTIN layout. */
export function repairGstin(raw) {
  const s = raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.length !== 15) return null;
  const toDigit = { O: '0', D: '0', Q: '0', I: '1', L: '1', Z: '2', S: '5', B: '8', G: '6', T: '7' };
  const toAlpha = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 8: 'B', 6: 'G', 7: 'T' };
  const digitPos = new Set([0, 1, 7, 8, 9, 10]);
  const alphaPos = new Set([2, 3, 4, 5, 6, 11]);
  let out = '';
  for (let i = 0; i < 15; i++) {
    let c = s[i];
    if (digitPos.has(i) && toDigit[c]) c = toDigit[c];
    if (alphaPos.has(i) && toAlpha[c]) c = toAlpha[c];
    if (i === 13 && (c === '2' || c === '7')) c = 'Z';
    out += c;
  }
  return isValidGstin(out) ? out : null;
}
