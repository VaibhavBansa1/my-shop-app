const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n, currency = 'INR') =>
  currency === 'INR' ? `₹${inr.format(n ?? 0)}` : new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(n ?? 0);
export const amount = (n) => inr.format(n ?? 0);
export const qty = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(n ?? 0);
const df = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const date = (d) => (d ? df.format(new Date(`${String(d).slice(0, 10)}T00:00:00Z`)) : '');
export const today = () => new Date().toISOString().slice(0, 10);
export const monthStart = () => `${today().slice(0, 8)}01`;
export const VOUCHER_TYPES = {
  sales: 'Sales', purchase: 'Purchase', receipt: 'Receipt', payment: 'Payment', contra: 'Contra',
  journal: 'Journal', credit_note: 'Credit Note', debit_note: 'Debit Note',
};
export const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', accountant: 'Accountant', cashier: 'Cashier', viewer: 'Viewer' };
