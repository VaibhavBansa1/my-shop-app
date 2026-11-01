// Request schemas (zod). Money/quantity values are accepted as numbers or decimal
// strings and converted to integers in the services.
import { z } from 'zod';
import { isValidGstin } from '../shared/gstin.js';

/** Partial schema for PATCH: every field optional and *no defaults applied*. */
export function patchOf(obj) {
  const shape = {};
  for (const [k, v] of Object.entries(obj.shape)) {
    let inner = v;
    while (inner instanceof z.ZodDefault || inner instanceof z.ZodOptional) inner = inner.unwrap();
    shape[k] = inner.optional();
  }
  return z.object(shape).strict();
}

const trimmed = (max) => z.string().trim().max(max);
export const uuid = z.uuid();
const decimal = z.union([z.number().finite(), z.string().trim().regex(/^-?\d{1,12}(\.\d{1,3})?$/)]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Invalid date');
const gstin = z.string().trim().toUpperCase()
  .regex(/^[0-9]{2}[A-Z0-9]{13}$/, 'GSTIN must be 15 characters, starting with the 2-digit state code')
  .refine(isValidGstin, 'This GSTIN is not valid (check digit does not match). Please re-check it.');
const stateCode = z.string().regex(/^[0-9]{2}$/, 'State code must be 2 digits');

export const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address'));
export const password = z.string().min(10, 'Password must be at least 10 characters').max(200);

export const signupSchema = z.object({ name: trimmed(120).min(1, 'Name is required'), email, password });
export const loginSchema = z.object({ email, password: z.string().min(1).max(200), returnToken: z.boolean().optional() });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: password });

export const orgCreateSchema = z.object({
  name: trimmed(120).min(1, 'Business name is required'),
  legalName: trimmed(200).optional().default(''),
  gstin: gstin.optional().nullable().or(z.literal('').transform(() => null)),
  stateCode: stateCode.optional().nullable().or(z.literal('').transform(() => null)),
  country: z.string().regex(/^[A-Z]{2}$/).optional().default('IN'),
  currency: z.string().regex(/^[A-Z]{3}$/).optional().default('INR'),
  address: trimmed(500).optional().default(''),
  phone: trimmed(40).optional().default(''),
  email: z.union([email, z.literal('')]).optional().default(''),
  fyStartMonth: z.number().int().min(1).max(12).optional().default(4),
  booksFrom: isoDate.optional(),
});
export const orgUpdateSchema = patchOf(orgCreateSchema);

export const inviteSchema = z.object({ email, role: z.enum(['admin', 'accountant', 'cashier', 'viewer']) });
export const roleChangeSchema = z.object({ role: z.enum(['owner', 'admin', 'accountant', 'cashier', 'viewer']) });

export const groupSchema = z.object({ name: trimmed(100).min(1), parentId: uuid });

export const ledgerSchema = z.object({
  name: trimmed(120).min(1, 'Ledger name is required'),
  groupId: uuid,
  openingBalance: decimal.optional().default(0),   // + debit, - credit
  gstin: gstin.optional().nullable().or(z.literal('').transform(() => null)),
  stateCode: stateCode.optional().nullable().or(z.literal('').transform(() => null)),
  phone: trimmed(40).optional().default(''),
  email: z.union([email, z.literal('')]).optional().default(''),
  address: trimmed(500).optional().default(''),
  isActive: z.boolean().optional().default(true),
});
export const ledgerUpdateSchema = patchOf(ledgerSchema);

export const unitSchema = z.object({
  symbol: trimmed(12).min(1), name: trimmed(60).min(1), decimals: z.number().int().min(0).max(3).optional().default(0),
});

export const itemSchema = z.object({
  name: trimmed(160).min(1, 'Item name is required'),
  sku: trimmed(60).optional().default(''),
  unitId: uuid,
  hsnCode: z.string().trim().regex(/^[0-9]{0,8}$/, 'HSN/SAC is up to 8 digits').optional().default(''),
  gstRate: decimal.optional().default(0),
  salePrice: decimal.optional().default(0),
  purchasePrice: decimal.optional().default(0),
  reorderLevel: decimal.optional().default(0),
  openingQty: decimal.optional().default(0),
  openingRate: decimal.optional().default(0),
  isActive: z.boolean().optional().default(true),
});
export const itemUpdateSchema = patchOf(itemSchema);

const itemLine = z.object({
  stockItemId: uuid,
  qty: decimal,
  rate: decimal,
  discount: decimal.optional().default(0),
  gstRate: decimal.optional(),           // defaults to the item's rate
  description: trimmed(300).optional().default(''),
});
const entryLine = z.object({
  ledgerId: uuid,
  debit: decimal.optional(),
  credit: decimal.optional(),
}).refine((e) => (e.debit != null) !== (e.credit != null), 'Each line needs either a debit or a credit amount');

export const voucherSchema = z.object({
  type: z.enum(['sales', 'purchase', 'receipt', 'payment', 'contra', 'journal', 'credit_note', 'debit_note']),
  date: isoDate,
  partyLedgerId: uuid.optional().nullable(),
  accountLedgerId: uuid.optional().nullable(),  // override Sales/Purchase ledger
  placeOfSupply: stateCode.optional().nullable(),
  reference: trimmed(80).optional().default(''),
  narration: trimmed(1000).optional().default(''),
  roundOff: z.boolean().optional().default(true),
  items: z.array(itemLine).max(200).optional().default([]),
  entries: z.array(entryLine).max(200).optional().default([]),
});
export const cancelSchema = z.object({ reason: trimmed(300).min(1, 'A reason is required') });

export const dateRange = z.object({ from: isoDate.optional(), to: isoDate.optional() });
