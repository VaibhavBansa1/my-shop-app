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
