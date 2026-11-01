// Role-based permissions inside an organization. RLS decides *which org's* rows are
// visible; this module decides what a member may *do* there.
export const ROLES = ['viewer', 'cashier', 'accountant', 'admin', 'owner'];
const rank = (r) => ROLES.indexOf(r);

const MIN_ROLE = {
  'org.read': 'viewer',
  'reports.read': 'viewer',
  'masters.read': 'viewer',
  'vouchers.read': 'viewer',
  'party.create': 'cashier',
  'voucher.create.sales': 'cashier',
  'voucher.create.receipt': 'cashier',
  'voucher.create.purchase': 'accountant',
  'voucher.create.payment': 'accountant',
  'voucher.create.contra': 'accountant',
  'voucher.create.journal': 'accountant',
  'voucher.create.credit_note': 'accountant',
  'voucher.create.debit_note': 'accountant',
  'voucher.cancel': 'accountant',
  'masters.write': 'accountant',
  'members.read': 'admin',
  'members.manage': 'admin',
  'audit.read': 'admin',
  'org.update': 'admin',
  'org.delete': 'owner',
};

export function can(role, action) {
  const min = MIN_ROLE[action];
  if (!min) throw new Error(`unknown action ${action}`);
  return rank(role) >= rank(min);
}

/** Can `actor` assign/remove `targetRole`? Only owners manage owners and admins. */
export function canManageRole(actorRole, targetRole) {
  if (actorRole === 'owner') return true;
  if (actorRole === 'admin') return rank(targetRole) < rank('admin');
  return false;
}

export function allowedActions(role) {
  return Object.keys(MIN_ROLE).filter((a) => can(role, a));
}
