// CSV generation for exports (opens cleanly in Excel / Google Sheets / LibreOffice).
// Guards against CSV/formula injection: a cell starting with = + - @ (or tab/CR) is prefixed
// with an apostrophe so spreadsheet apps show it as text instead of running it.
const DANGEROUS = /^[=+\-@\t\r]/;

export function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v);
  if (DANGEROUS.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

/** rows: array of arrays; returns CSV text with a UTF-8 BOM so Excel shows ₹ and Hindi correctly. */
export function toCsv(rows) {
  return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** Parse CSV text (RFC 4180: quotes, escaped quotes, CRLF, BOM) into an array of string arrays. */
export function parseCsv(text, { maxRows = 10000 } = {}) {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
      if (rows.length > maxRows) throw new RangeError(`The file has more than ${maxRows} rows.`);
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** Rows with a header line -> array of objects keyed by normalised header (lower case, _ for spaces). */
export function csvToObjects(text, opts) {
  const [head, ...body] = parseCsv(text, opts);
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}
