# Database design

PostgreSQL 14+ (developed on 16). Schema lives in `db/migrations/NNN_*.sql`, applied in order
by `npm run db:migrate` (checksummed; an applied migration must never be edited — add a new one).

## Roles

| Role | Used by | Rights |
|---|---|---|
| `shop_owner` | migrations only (`DATABASE_OWNER_URL`) | owns all tables |
| `shop_app` | the running app (`DATABASE_URL`) | `NOBYPASSRLS`, not owner; limited grants (see `003_grants.sql`, `006`) |

Never point `DATABASE_URL` at `shop_owner` or a superuser — that would switch off tenant isolation.

## Conventions

- Every tenant table has `org_id uuid not null` and RLS `org_id = app_org_id()`, **enabled and forced**.
- Cross-table references inside a tenant use composite keys `(org_id, x_id) → (org_id, id)`, so a
  row can never point at another organization's row.
- Money: `numeric(14,2)`. Quantities: `numeric(14,3)`. GST rate: `numeric(5,2)`.
- Signed amounts: **debit positive, credit negative**.
- Request context: `app.user_id` and `app.org_id` set with `set_config(..., true)` (transaction-local).

## Entity relationship

```
users ──< memberships >── organizations ──< invitations
  │                            │
  └──< sessions                ├──< account_groups (tree via parent_id)
                               │        └──< ledgers
                               ├──< units ──< stock_items
                               ├──< voucher_sequences
                               ├──< vouchers ──< voucher_entries >── ledgers
                               │        └─────< voucher_items  >── stock_items
                               └──< audit_log
```

## Tables

### Identity (global)
- **users** — `email citext unique`, `name`, `password_hash` (`scrypt$N$r$p$salt$hash`).
- **sessions** — `token_hash bytea pk` (sha256 of the client token), `user_id`, `expires_at`
  (sliding 30 days), `created_at` (hard cap 90 days), `ip`, `user_agent`.
- **login_attempts** — throttling counters keyed `email:<x>`, `ip:<x>`, `signup-ip:<x>`, `reset-email:<x>`,
  `ocr-image:<user>`, `ocr-text:<user>`.
- **password_resets** — `token_hash` (sha256), `user_id`, 30-minute `expires_at`, `used_at`.

### Tenancy
- **organizations** — name, legal name, `gstin` (15 chars, validated), `state_code` (GST code,
  e.g. `23` MP), country, currency, address, `fy_start_month` (4 = April), `books_from`.
- **memberships** — `(org_id, user_id)` pk, `role org_role` (`owner|admin|accountant|cashier|viewer`).
  Policy: visible if in the current org **or** it is your own row (so you can list your orgs);
  writes only in the current org. Queries must therefore always filter `org_id = app_org_id()`.
- **invitations** — email, role (never owner), `token_hash`, 7-day expiry, accepted/revoked stamps.
  Accepted via the `accept_invitation(token_hash, user_id)` SECURITY DEFINER function.

### Chart of accounts
- **account_groups** — Tally primary groups and sub-groups, seeded per org by
  `seed_organization()`: Capital Account, Loans (Liability), Current Liabilities (Duties & Taxes,
  Sundry Creditors, …), Fixed Assets, Investments, Current Assets (Bank Accounts, Cash-in-Hand,
  Sundry Debtors, Stock-in-Hand, …), Sales/Purchase Accounts, Direct/Indirect Incomes and Expenses.
  `nature` (asset/liability/equity/income/expense), `affects_gross_profit`, stable `code`.
- **ledgers** — accounts under a group; `opening_balance` (Dr+); optional party details (GSTIN,
  state, phone, email, address); `code` for built-ins: `cash, capital, sales, purchase,
  output_cgst/sgst/igst, input_cgst/sgst/igst, round_off, discount, rent, salary, electricity`.

### Inventory
- **units** — symbol, name, allowed decimals (pcs 0, kg 3, l 3, …).
- **stock_items** — name, sku (unique when set), unit, HSN/SAC, GST rate, sale/purchase price,
  reorder level, opening qty and rate. **Stock on hand is never stored**; it is
  `opening_qty + Σ voucher_items.stock_qty` over posted vouchers.

### Transactions
- **voucher_sequences** — next number per `(org, type, financial year)`; incremented with a row
  lock inside the voucher's transaction, so numbering is gap-free.
- **vouchers** — type, FY, number, date, party, place of supply, reference, narration, totals,
  `status posted|cancelled`, cancel reason/by/at, created by/at.
  Trigger `guard_voucher_update`: posted → cancelled is the only change allowed; the app role
  can only UPDATE the four cancellation columns and cannot DELETE.
- **voucher_entries** — `(ledger, amount)` lines. Deferred constraint trigger
  `check_voucher_balanced`: every voucher must have ≥ 2 entries summing to exactly 0.
- **voucher_items** — item lines: qty, rate, discount, taxable value, GST rate, CGST/SGST/IGST,
  `stock_qty` (signed: sales/debit note −, purchase/credit note +).
- **audit_log** — append-only (`SELECT, INSERT` only) record of every change.

## Indexes worth knowing
`vouchers(org_id, date desc, created_at desc)`, `voucher_entries(org_id, ledger_id)`,
`voucher_items(org_id, stock_item_id)`, `ledgers(org_id, group_id)`, `audit_log(org_id, at desc)`,
`sessions(user_id)`, `login_attempts(key, at desc)`.

## Migrations so far
| File | What |
|---|---|
| 001_init | all tables, triggers, RLS, invitation functions |
| 002_seed_function | `seed_organization()` default groups, ledgers, units |
| 003_grants | least-privilege grants for `shop_app` |
| 004_definer_policies | lets the two SECURITY DEFINER functions see invitations under FORCE RLS |
| 005_fix_accept_invitation | OUT-parameter name clash fix |
| 006_deferrable_master_fks | org deletion with vouchers; revoke DELETE on masters |
| 007_password_resets | one-time password reset tokens (hashed) |
| 008_email_verification | `users.email_verified_at`, `email_verifications` tokens |
| 009_org_ai_setting | `organizations.ai_enabled` opt-in |
| 010_notifications | `notifications` (per recipient, RLS), `memberships.notify_email`, `organizations.upi_id`, join alerts, job helpers |
| 011_fix_upi_check | UPI ID check within Postgres regex limits |
