# What the app does — feature checklist

✅ built and tested · 🟡 partly · ❌ not yet (see HANDOFF backlog)

## Businesses (firms)
- ✅ **One person, one firm:** after sign-in you go straight into it.
- ✅ **One person, many firms:** create up to 20 businesses (and be invited to any number). "Your businesses"
  shows each firm's sales today, this month and cash & bank, plus totals across firms. Switch any time
  (sidebar → business name, or More → Switch business on the phone).
- ✅ Each firm has **completely separate** books, ledgers, stock, voucher numbering, GST settings, team and
  roles. Your role can differ per firm (owner of one, accountant in another).
- ✅ Invite staff with roles (owner, admin, accountant, cashier, viewer).

## Billing and accounts
- ✅ Sales, purchase, receipt, payment, contra, journal, credit note, debit note — double entry, always balanced.
- ✅ GST: CGST/SGST or IGST by place of supply, HSN, round-off, printable tax invoice, GST summary.
- ✅ Correct a voucher (cancel + re-enter in one step), cancel with reason, duplicate supplier bill check.
- ✅ Scan supplier invoices (OCR) on the phone or the server.

## Inventory
- ✅ Stock items with unit, HSN, GST, prices, reorder level, opening stock.
- ✅ Stock on hand always calculated from transactions (never drifts).
- ✅ Low-stock list and alerts.
- ✅ **Stock adjustments** (damage, expiry, loss, free stock found) and **physical stock count** — type the
  counted quantity and the differences are recorded as one adjustment (`ADJ/26-27/1`).
- ✅ Stock summary with weighted average cost and value.
- ❌ Multiple godowns/warehouses, batches and expiry dates, barcode scanning.

## Profit and loss and reports
- ✅ Profit & Loss (gross and net profit, opening/closing stock), Balance Sheet, Trial Balance, Day Book,
  Ledger statements, Receivables/Payables, Stock Summary, GST Summary, dashboard.
- ✅ Optional AI summary in English/Hindi/Hinglish.

## Import and export
- ✅ **Import** stock items and customers/suppliers from **CSV** (Excel/Google Sheets): template download,
  every row checked first with errors by row number, all-or-nothing save, option to skip existing names.
- ✅ **Export** every report and the voucher list to **CSV**; **full JSON backup** of a business.
- ✅ Print / PDF of invoices and reports.
- ❌ Import of vouchers/opening transactions from Tally; Tally XML export.

## Messages and notifications
- ✅ Alerts: cancelled bills, low stock, new members, daily summary (in app + optional email).
- ✅ Payment reminders by WhatsApp/SMS/email with UPI ID; share bills on WhatsApp.
- ❌ Push notifications when the phone app is closed.

## Security and privacy
- ✅ Only you and the people you invite can see a business (database-enforced). See DATA_PROTECTION.md.
- ✅ Contact details encrypted in the database; passwords and tokens hashed; HTTPS in transit.
- ✅ Email confirmation, password reset, activity log, role permissions.
- ❌ Two-factor sign-in.

## Operations
- ✅ Structured logs, request ids, Prometheus metrics, health/readiness checks.
- ✅ Feature flags (kill switch, % rollout, per-business allow/deny) with CLI.
- ✅ Security event log + "your devices" with sign-out; activity log per business.
- ✅ Optional Redis (rate limits, caches, queue); background worker with daily schedules.
- ✅ Report cache that is never stale.
- ✅ Docker image + full compose stack; Kubernetes manifests (HPA, PDB, probes, NetworkPolicy, hardened pods).

## Phone app (Android)
- ✅ Sell, receipts, expenses, vouchers + PDF share, stock (add items), customers, reports, scanning,
  AI summary, notifications, payment reminders.
- 🟡 Import, stock count, team and settings are on the website only.
