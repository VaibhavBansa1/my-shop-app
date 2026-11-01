const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n) => { const v = Number(n ?? 0); return `${v < 0 ? '−' : ''}₹${inr.format(Math.abs(v))}`; };
export const amount = (n) => inr.format(Number(n ?? 0));
export const qty = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(Number(n ?? 0));
const df = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const date = (d) => (d ? df.format(new Date(`${String(d).slice(0, 10)}T00:00:00Z`)) : '');
/** Local calendar date YYYY-MM-DD (not UTC: a sale at 1 am IST belongs to today). */
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const monthStart = () => `${today().slice(0, 8)}01`;
export const VOUCHER_TYPES = {
  sales: 'Sales', purchase: 'Purchase', receipt: 'Receipt', payment: 'Payment', contra: 'Contra',
  journal: 'Journal', credit_note: 'Credit Note', debit_note: 'Debit Note', stock_adjustment: 'Stock Adjustment',
};
export const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', accountant: 'Accountant', cashier: 'Cashier', viewer: 'Viewer' };
