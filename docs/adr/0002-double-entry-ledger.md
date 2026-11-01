# ADR-0002: Tally-style double-entry ledger as the core data model

**Status:** Accepted
**Date:** 2026-11-01
**Deciders:** Vaibhav Bansal (owner)

## Context
The old app had separate `sales`, `purchases`, `expenses` tables and a mutable
`products.stock` counter. That cannot produce a trial balance, P&L or balance sheet,
stock drifts when edits fail halfway, and it does not match how Indian shopkeepers
and their accountants (who use Tally) think.

## Decision
Model everything as **vouchers** with **ledger entries** (signed amounts, debit
positive, credit negative) under a **group** tree, plus **item lines** for stock.
A deferred constraint trigger rejects any voucher whose entries do not sum to zero.
Stock and balances are always *derived* from vouchers, never stored as counters.

## Options Considered

### Option A: Double-entry vouchers (chosen)
| Complexity | Medium | Cost | Low | Scalability | Good with indexes | Familiarity | Matches Tally |

**Pros:** every report (trial balance, P&L, balance sheet, ledger, outstanding) is a
query over one table; books always balance; full audit trail.
**Cons:** more rows per sale; UI must hide the accounting for simple users.

### Option B: Separate tables per transaction kind (old design)
| Complexity | Low at first, high later | Cost | Low | Scalability | OK | Familiarity | High |

**Pros:** simple CRUD. **Cons:** no real accounting; each new report is custom code; stock counter drift.

### Option C: Event sourcing with projections
| Complexity | High | Cost | Medium | Scalability | Excellent | Familiarity | Low |

**Pros:** perfect history. **Cons:** far too much machinery for the team size.

## Trade-off Analysis
A is the standard, proven accounting model and gives most of C's auditability
(vouchers are append-only; cancel instead of delete) without the machinery.

## Consequences
- Easier: new reports, GST summaries, auditor exports.
- Harder: editing a posted voucher = cancel and re-enter (like Tally's audit mode).
- Revisit: monthly balance snapshots if reports over many years become slow.

## Action Items
1. [x] Tables `account_groups`, `ledgers`, `vouchers`, `voucher_entries`, `voucher_items`.
2. [x] Balance trigger + tests.
3. [x] Seed default groups and ledgers when an organization is created.
