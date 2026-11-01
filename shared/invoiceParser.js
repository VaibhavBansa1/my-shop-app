// Turns OCR text of a (mostly Indian GST) purchase invoice into a structured DRAFT.
// It never decides anything on its own: every field is a suggestion the user confirms.
// Pure JS: runs on the server (after Tesseract) and could run on the phone (after ML Kit).
import { repairGstin } from './gstin.js';

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MAX_TEXT = 50_000;

/** "1,23,456.78" | "₹ 450.00" | "450/-" -> 123456.78 ; null if not a number */
export function parseAmount(s) {
  if (s == null) return null;
  const t = String(s).replace(/[₹]|rs\.?|inr/gi, '').replace(/\/-$/, '').replace(/,/g, '').trim();
  if (!/^-?\d+(\.\d{1,3})?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const NUM_RE = /(?:₹\s?)?-?\d{1,3}(?:,\d{2,3})*(?:\.\d{1,3})?(?!\d)|-?\d+(?:\.\d{1,3})?/g;
function numbersIn(line) {
  return (line.match(NUM_RE) || []).map(parseAmount).filter((n) => n !== null);
}

function pad(n) { return String(n).padStart(2, '0'); }
function validDate(y, m, d) {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Indian invoices are day-first. Returns YYYY-MM-DD or null. */
export function parseDate(s) {
  let m = s.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (m) return validDate(Number(m[3]), Number(m[2]), Number(m[1]));
  m = s.match(/\b(\d{1,2})[\s\-]*([A-Za-z]{3,9})[\s\-,]*(\d{2,4})\b/);
  if (m) {
    const key = m[2].toLowerCase();
    const mon = MONTHS[key.slice(0, 4)] ?? MONTHS[key.slice(0, 3)];
    if (mon) return validDate(Number(m[3]), mon, Number(m[1]));
  }
  m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

function lastAmountAfter(line, labelRe) {
  const idx = line.search(labelRe);
  if (idx < 0) return null;
  const rest = line.slice(idx).replace(labelRe, '');
  // Drop "@ 9%" / "9%" rate mentions so we take the amount, not the rate.
  const cleaned = rest.replace(/@?\s*\d+(\.\d+)?\s*%/g, ' ');
  const nums = numbersIn(cleaned);
  return nums.length ? nums[nums.length - 1] : null;
}

const round2 = (n) => Math.round(n * 100) / 100;
const near = (a, b, tol = 1.01) => Math.abs(a - b) <= tol;

/**
 * @param {string} text   raw OCR text
 * @param {{ownGstin?: string|null}} opts  the buyer's (our) GSTIN, to tell supplier from buyer
 */
export function parseInvoiceText(text, { ownGstin = null } = {}) {
  const src = String(text ?? '').slice(0, MAX_TEXT).replace(/\r/g, '');
  const lines = src.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const warnings = [];

  // GSTINs (repair OCR confusions; only checksum-valid ones are kept)
  const gstins = [];
  for (const l of lines) {
    const compact = l.toUpperCase().replace(/[\s\-]/g, '').slice(0, 400);
    for (let i = 0; i + 15 <= compact.length; i++) {
      const g = repairGstin(compact.slice(i, i + 15));
      if (g && !gstins.includes(g)) { gstins.push(g); i += 14; }
    }
  }
  const own = ownGstin ? ownGstin.toUpperCase() : null;
  const supplierGstin = gstins.find((g) => g !== own) ?? null;
  if (own && gstins.length && !gstins.includes(own)) warnings.push('Your GSTIN was not found on this invoice. Check it is billed to you.');

  // Supplier name guess: first line with letters that is not a document title/label, above the first GSTIN.
  let supplierName = null;
  for (const l of lines.slice(0, 8)) {
    if (/gstin|invoice|bill\s*to|tax|original|duplicate|cash\s*memo|estimate|phone|mob|email|@/i.test(l)) { if (/gstin/i.test(l)) break; continue; }
    const letters = l.replace(/[^A-Za-z]/g, '');
    if (letters.length >= 3 && letters.length / l.length > 0.5) { supplierName = l.replace(/[^\w&.,'()\- ]/g, '').trim().slice(0, 120); break; }
  }

  // Invoice number
  let invoiceNumber = null;
  for (const l of lines) {
    const m = l.match(/\b(?:tax\s+)?(?:invoice|inv|bill)\s*(?:no\.?|number|num|#)\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\/\-_.]{0,39})/i);
    if (m && /\d/.test(m[1])) { invoiceNumber = m[1].replace(/[.\-_/]+$/, ''); break; }
  }

  // Date: prefer a line mentioning "date", else first date in the document
  let invoiceDate = null;
  for (const l of lines) if (/date|dt\b|dated/i.test(l)) { invoiceDate = parseDate(l); if (invoiceDate) break; }
  if (!invoiceDate) for (const l of lines) { invoiceDate = parseDate(l); if (invoiceDate) break; }

  // Tax and totals (take the last matching line: summary blocks are at the bottom)
  const totals = { taxable: null, cgst: null, sgst: null, igst: null, total: null, roundOff: null };
  for (const l of lines) {
    const low = l.toLowerCase();
    if (/\bcgst\b/.test(low) && !/sgst|igst/.test(low)) totals.cgst = lastAmountAfter(l, /cgst/i) ?? totals.cgst;
    else if (/\b(sgst|utgst)\b/.test(low) && !/cgst|igst/.test(low)) totals.sgst = lastAmountAfter(l, /sgst|utgst/i) ?? totals.sgst;
    else if (/\bigst\b/.test(low) && !/cgst|sgst/.test(low)) totals.igst = lastAmountAfter(l, /igst/i) ?? totals.igst;
    if (/taxable\s*(value|amount|amt)?|sub\s*-?\s*total/i.test(l)) totals.taxable = lastAmountAfter(l, /taxable\s*(value|amount|amt)?|sub\s*-?\s*total/i) ?? totals.taxable;
    if (/round\s*(ed)?\s*off/i.test(l)) totals.roundOff = lastAmountAfter(l, /round\s*(ed)?\s*off/i) ?? totals.roundOff;
    if (/(grand\s*total|total\s*amount|net\s*amount|invoice\s*total|amount\s*payable|total\s*payable|^total\b)/i.test(l)
        && !/taxable|sub\s*-?\s*total|total\s*tax|in\s*words/i.test(l)) {
      totals.total = lastAmountAfter(l, /(grand\s*total|total\s*amount|net\s*amount|invoice\s*total|amount\s*payable|total\s*payable|total)/i) ?? totals.total;
    }
  }

  // Item lines: text, optional HSN (4-8 digits), and numbers where qty × rate ≈ amount.
  const items = [];
  for (const l of lines) {
    if (/total|cgst|sgst|igst|gstin|invoice|date|round|bank|ifsc|phone|mob|pin/i.test(l)) continue;
    const pctMatch = l.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%/);
    const gstRate = pctMatch ? Number(pctMatch[1]) : null;
    const withoutPct = l.replace(/\d{1,2}(?:\.\d{1,2})?\s*%/g, ' ');
    const hsnMatch = withoutPct.match(/\b(\d{4}|\d{6}|\d{8})\b/);
    const nums = numbersIn(withoutPct.replace(hsnMatch ? hsnMatch[0] : '\u0000', ' '));
    if (nums.length < 3) continue;
    let found = null;
    // Search the numeric tail for qty, rate, amount with qty*rate ≈ amount (±1 or ±1%, allowing discount)
    for (let i = nums.length - 1; i >= 2 && !found; i--) {
      const amount = nums[i];
      for (let j = i - 1; j >= 1 && !found; j--) {
        for (let k = j - 1; k >= 0 && !found; k--) {
          const q = nums[k]; const r = nums[j];
          if (q > 0 && q < 100000 && r > 0 && amount > 0) {
            const gross = q * r;
            if (near(gross, amount, Math.max(1, gross * 0.01)) || (amount < gross && amount > gross * 0.5 && i === nums.length - 1 && j === k + 1 && nums.length >= 4)) {
              found = { qty: q, rate: r, amount };
            }
          }
        }
      }
    }
    if (!found) continue;
    // Description = words before the first purely numeric token, after dropping a leading serial no.
    const words = l.replace(/^\s*\d{1,3}[.)]?\s+/, '').split(' ');
    const stop = words.findIndex((w) => /^[₹]?[\d,]+(\.\d+)?%?\/?-?$/.test(w));
    let description = (stop === -1 ? words : words.slice(0, stop)).join(' ').replace(/[|:]+/g, ' ').replace(/^[^A-Za-z0-9]+/, '').trim();
    if (description.length < 2) continue;
    items.push({ description: description.slice(0, 120), hsn: hsnMatch ? hsnMatch[1] : null, qty: found.qty, rate: round2(found.rate),
      amount: round2(found.amount), discount: round2(Math.max(found.qty * found.rate - found.amount, 0)), gstRate });
  }

  // Cross-checks
  const taxSum = (totals.cgst ?? 0) + (totals.sgst ?? 0) + (totals.igst ?? 0);
  const itemsSum = round2(items.reduce((a, i) => a + i.amount, 0));
  if (totals.taxable == null && items.length) totals.taxable = itemsSum;
  if (totals.taxable != null && totals.total != null) {
    const expected = totals.taxable + taxSum + (totals.roundOff ?? 0);
    if (!near(expected, totals.total, 1.5)) warnings.push('Taxable value plus tax does not match the invoice total. Please check the amounts.');
  }
  if (items.length && totals.taxable != null && !near(itemsSum, totals.taxable, Math.max(1, totals.taxable * 0.01))) {
    warnings.push('Some item lines may be missing or misread: their sum does not match the taxable value.');
  }
  if (totals.cgst != null && totals.sgst != null && !near(totals.cgst, totals.sgst, 0.02)) warnings.push('CGST and SGST differ; they are normally equal.');
  if (!supplierGstin) warnings.push('Supplier GSTIN not found.');
  if (!invoiceDate) warnings.push('Invoice date not found.');
  if (!items.length) warnings.push('No item lines recognised. Add items manually.');

  const filled = [supplierGstin, invoiceNumber, invoiceDate, totals.total, items.length ? 1 : null].filter((x) => x != null).length;
  return {
    supplierGstin, supplierName, gstins, invoiceNumber, invoiceDate,
    interState: totals.igst != null && totals.igst > 0 ? true : (totals.cgst != null || totals.sgst != null ? false : null),
    totals, items: items.slice(0, 100), warnings, confidence: round2(filled / 5),
  };
}
