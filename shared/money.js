// Money and quantities are handled as integers: paise (1/100) and milli-units (1/1000).
// Never use floating point arithmetic on money.

const DEC_RE = /^-?\d{1,12}(\.\d+)?$/;

function parseScaled(value, scale, label) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`${label} is not a finite number`);
    value = value.toFixed(scale + 2);
  }
  if (typeof value !== 'string' || !DEC_RE.test(value.trim())) {
    throw new RangeError(`${label} is not a valid number`);
  }
  const s = value.trim();
  const neg = s.startsWith('-');
  const [intPart, frac = ''] = (neg ? s.slice(1) : s).split('.');
  const extra = frac.slice(scale);
  if (/[1-9]/.test(extra)) throw new RangeError(`${label} has more than ${scale} decimal places`);
  const n = Number(intPart) * 10 ** scale + Number((frac.slice(0, scale) || '0').padEnd(scale, '0'));
  if (!Number.isSafeInteger(n)) throw new RangeError(`${label} is too large`);
  return neg ? -n : n;
}

/** "123.45" | 123.45 -> 12345 */
export const toPaise = (v, label = 'amount') => parseScaled(v, 2, label);
/** "1.5" -> 1500 */
export const toMilli = (v, label = 'quantity') => parseScaled(v, 3, label);

function formatScaled(n, scale) {
  const neg = n < 0;
  const abs = Math.abs(n);
  const d = 10 ** scale;
  const s = `${Math.trunc(abs / d)}.${String(abs % d).padStart(scale, '0')}`;
  return neg ? `-${s}` : s;
}
/** 12345 -> "123.45" (string, safe to send to Postgres numeric) */
export const paiseToStr = (n) => formatScaled(n, 2);
export const milliToStr = (n) => formatScaled(n, 3);
/** Postgres numeric string -> number of rupees for JSON output */
export const num = (v) => (v == null ? 0 : Number(v));

/** Round a BigInt division half away from zero. */
export function divRound(numer, denom) {
  const n = BigInt(numer);
  const d = BigInt(denom);
  const neg = (n < 0n) !== (d < 0n);
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = (an * 2n + ad) / (ad * 2n);
  return Number(neg ? -q : q);
}
