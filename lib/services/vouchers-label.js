// Voucher number labels, e.g. INV/26-27/15.
export const PREFIX = { sales: 'INV', purchase: 'PUR', receipt: 'RCT', payment: 'PAY', contra: 'CON', journal: 'JRN',
  credit_note: 'CN', debit_note: 'DN', stock_adjustment: 'ADJ' };

export function voucherNumberLabel(type, fy, number) {
  const y = Number(fy.slice(0, 4));
  return `${PREFIX[type]}/${String(y).slice(2)}-${String(y + 1).slice(2)}/${number}`;
}

