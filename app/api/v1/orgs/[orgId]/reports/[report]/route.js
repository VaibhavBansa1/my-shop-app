import { z } from 'zod';
import { route } from '../../../../../../../lib/http.js';
import { dateRange, uuid } from '../../../../../../../lib/validation.js';
import * as R from '../../../../../../../lib/services/reports.js';
import { notFound } from '../../../../../../../lib/errors.js';

const q = dateRange.extend({ ledger: uuid.optional(), kind: z.enum(['receivable', 'payable']).optional() });

const REPORTS = {
  'dashboard': (db) => R.dashboard(db),
  'trial-balance': (db, p) => R.trialBalance(db, p),
  'profit-loss': (db, p) => R.profitLoss(db, p),
  'balance-sheet': (db, p) => R.balanceSheet(db, p),
  'day-book': (db, p) => R.dayBook(db, p),
  'stock-summary': (db, p) => R.stockSummary(db, p),
  'gst-summary': (db, p) => R.gstSummary(db, p),
  'outstanding': (db, p) => R.outstanding(db, p),
  'ledger': (db, p) => { if (!p.ledger) throw notFound('Choose a ledger.'); return R.ledgerStatement(db, p.ledger, p); },
};

export const GET = route(async ({ request, db, params }) => {
  const fn = Object.hasOwn(REPORTS, params.report) ? REPORTS[params.report] : null;
  if (!fn) throw notFound('Unknown report.');
  const p = q.parse(Object.fromEntries(new URL(request.url).searchParams));
  return fn(db, Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)));
}, { action: 'reports.read' });
