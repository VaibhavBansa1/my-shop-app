// Invoice digitization: OCR (server, Tesseract, offline language data) + parsing + matching.
// Images are processed in memory and never stored. Results are suggestions for a purchase
// voucher that the user must review and save themselves.
import path from 'node:path';
import { createRequire } from 'node:module';
import { withOrg } from '../db.js';
import { parseInvoiceText } from '../../shared/invoiceParser.js';
import { badRequest } from '../errors.js';

const require = createRequire(import.meta.url);
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;      // ~ 6300 x 6300; blocks decompression bombs
const OCR_TIMEOUT_MS = 45_000;

/** Identify JPEG/PNG by magic bytes and read width/height without decoding. */
export function inspectImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24) throw badRequest('That file is not an image.');
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') {
    return { type: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      // SOF0..SOF15 except DHT(c4), JPG(c8), DAC(cc)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: 'jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    throw badRequest('Could not read this JPEG image.');
  }
  throw badRequest('Please upload a JPEG or PNG photo of the invoice.');
}

export function checkImage(buf) {
  if (buf.length > MAX_IMAGE_BYTES) throw badRequest('Image is too large (max 8 MB).');
  const info = inspectImage(buf);
  if (!info.width || !info.height || info.width * info.height > MAX_PIXELS) {
    throw badRequest('Image resolution is too large. Please use a smaller photo.');
  }
  if (Math.min(info.width, info.height) < 200) throw badRequest('Image is too small to read. Please take a clearer photo.');
  return info;
}

// One shared worker per process; jobs run one at a time (Tesseract is CPU-bound).
let workerPromise = null;
let queue = Promise.resolve();

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = require('tesseract.js');
      const langPath = path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');
      const w = await createWorker('eng', 1, { langPath, cacheMethod: 'none', gzip: true });
      // PSM 4: a single column of text of variable sizes — reads invoice tables row by row.
      await w.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1' });
      return w;
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

async function resetWorker() {
  const w = workerPromise;
  workerPromise = null;
  if (w) (await w.catch(() => null))?.terminate().catch(() => {});
}

/** OCR an image buffer -> { text, confidence } */
export function recognize(buf) {
  checkImage(buf);
  const job = queue.then(async () => {
    const worker = await getWorker();
    let timer;
    try {
      const result = await Promise.race([
        worker.recognize(buf),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('ocr timeout')), OCR_TIMEOUT_MS); }),
      ]);
      return { text: result.data.text ?? '', confidence: Math.round(result.data.confidence ?? 0) };
    } catch (e) {
      await resetWorker();
      if (e.message === 'ocr timeout') throw badRequest('Reading the image took too long. Try a smaller, clearer photo.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  });
  queue = job.catch(() => {});
  return job;
}

export async function shutdownOcr() { await resetWorker(); }

// ---------- matching OCR results to the organization's masters ----------
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s) => new Set(norm(s).split(' ').filter((t) => t.length > 1));
export function similarity(a, b) {
  const A = tokens(a); const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Parse OCR text and suggest matching supplier ledger and stock items. */
export async function draftFromText(db, text, meta = {}) {
  return withOrg(db, async (c) => {
    const org = (await c.query('select gstin from organizations where id = $1', [db.orgId])).rows[0];
    const parsed = parseInvoiceText(text, { ownGstin: org?.gstin });
    let supplier = null;
    if (parsed.supplierGstin) {
      const { rows } = await c.query('select id, name, state_code from ledgers where gstin = $1 and is_active limit 1', [parsed.supplierGstin]);
      supplier = rows[0] ? { ledgerId: rows[0].id, name: rows[0].name, stateCode: rows[0].state_code } : null;
    }
    const { rows: items } = await c.query('select id, name, hsn_code, gst_rate, purchase_price from stock_items where is_active');
    const lines = parsed.items.map((l) => {
      const scored = items.map((it) => ({
        it, score: similarity(l.description, it.name) + (l.hsn && it.hsn_code === l.hsn ? 0.25 : 0),
      })).filter((x) => x.score >= 0.3).sort((a, b) => b.score - a.score).slice(0, 3);
      return {
        ...l,
        match: scored[0] && scored[0].score >= 0.5 ? { stockItemId: scored[0].it.id, name: scored[0].it.name, score: Math.round(scored[0].score * 100) / 100 } : null,
        candidates: scored.map((x) => ({ stockItemId: x.it.id, name: x.it.name, score: Math.round(x.score * 100) / 100 })),
      };
    });
    return {
      ...parsed, items: lines, supplier,
      supplierStateCode: parsed.supplierGstin ? parsed.supplierGstin.slice(0, 2) : null,
      ocr: meta.confidence != null ? { engine: meta.engine, confidence: meta.confidence } : { engine: meta.engine ?? 'device' },
      rawText: String(text).slice(0, 20000),
    };
  });
}
