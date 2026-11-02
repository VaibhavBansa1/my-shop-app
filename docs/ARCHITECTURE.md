# My Shop App — System Design

A Tally-style accounting, inventory and GST billing app for shops. It runs in any
browser (phone or computer). Any business in the world can sign up, create its own
organization, invite staff, and work in an isolated, secure space. An Android app
(Expo, in `mobile/`) uses the same API. Supplier invoices can be scanned (OCR) on the phone or online.

This document is the source of truth for the design. Decisions with real trade-offs
are recorded as ADRs in [`docs/adr/`](adr/). The database is described table by
table in [`DATABASE.md`](DATABASE.md), and the security model in
[`SECURITY.md`](SECURITY.md).

---

## 1. Requirements

### Functional

| Area | What it must do |
|---|---|
| Sign up and sign in | Email + password accounts. Sessions on web (cookie) and native (bearer token). Sign out everywhere. |
| Organizations | A user can create many organizations (shops/companies) and belong to many. Each has its own books. |
| Team | Invite staff by email with a role: **owner, admin, accountant, cashier, viewer**. Remove members, change roles. |
| Chart of accounts | Tally-style **groups** (Current Assets, Sundry Debtors, Sales Accounts, Duties & Taxes, ...) and **ledgers** under them. Seeded on organization creation. Opening balances. |
| Inventory | Stock items with unit, HSN/SAC, GST rate, sale/purchase price, reorder level, opening stock. Stock on hand computed from vouchers. |
| Vouchers | Sales, Purchase, Receipt, Payment, Contra, Journal, Credit Note, Debit Note. Every voucher is double-entry and must balance. Item-wise vouchers (sales/purchase/notes) move stock. Automatic gap-free numbering per type per financial year. Cancel instead of delete. |
| GST (India) | Per-line GST rate. Intra-state → CGST + SGST; inter-state → IGST, decided from the organization's state and the place of supply. |
| Reports | Day Book, Ledger statement, Trial Balance, Profit & Loss, Balance Sheet, Stock Summary, GST summary (outward/inward tax by rate), Outstanding receivables/payables. |
| Audit | Every create/update/cancel is written to an append-only audit log. |
| Corrections | "Correct" a voucher = new voucher + cancel the original in one transaction. Duplicate supplier bills refused. |
| Exports | CSV for every report and the voucher list; full JSON backup per business. |
| Help | Glossary and field reference inside the app (`/help`), from docs/GLOSSARY.md and docs/FIELDS.md. |
| Invoice scanning | Photo of a supplier invoice → OCR (on phone or server) → reviewed purchase draft → purchase voucher. See [OCR.md](OCR.md). |
| Email | Account confirmation, password reset, invitations, welcome; SMTP or Resend. See [EMAIL.md](EMAIL.md). |
| AI (optional) | Plain-language shop summary / Q&A via Ollama, LM Studio, Groq, OpenRouter, Grok or OpenAI. See [AI.md](AI.md). |
| Android app | Sell, receipts/expenses, vouchers with PDF share, stock, parties, reports, invoice scanning. See [MOBILE.md](MOBILE.md). |

### Non-functional

| Concern | Target |
|---|---|
| Tenant isolation | One organization can **never** read or write another's data, even if application code has a bug. Enforced in the database (Postgres Row-Level Security). |
| Correctness of money | No floating point for money. `numeric(14,2)` in Postgres, integer paise in JavaScript. Every voucher balances (debits = credits), enforced by a database trigger. |
| Scale (initial) | Thousands of organizations, each with up to ~100k vouchers/year. A single Postgres instance handles this comfortably. |
| Latency | p95 < 300 ms for normal screens; reports over one year < 1 s. |
| Availability | Single region, managed Postgres with daily backups + point-in-time recovery. |
| Devices | Mobile-first responsive UI; works on a cheap Android phone browser. |
| Portability | Runs anywhere Node 20+ and Postgres 14+ run: a laptop, a VPS, or a PaaS. |

### Constraints

- One developer (the owner) plus AI help. Prefer boring, well-known tools.
- Existing stack is Next.js + `pg`. Keep it.
- Must be resumable: anyone can clone, read `docs/`, run `npm run db:migrate`, `npm test`, `npm run dev`.

---

## 2. High-level design

```
         Browser (phone / desktop)          Android app (Expo, mobile/)
                    │  HTTPS, cookie session              │  HTTPS, Bearer token
                    ▼                                      ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │                     Next.js server (one deployable)              │
   │                                                                  │
   │  UI pages (React, App Router)   REST API  /api/v1/...            │
   │        │ fetch                          │                        │
   │        └───────────────►  lib/http  (auth, CSRF origin check,    │
   │                           validation, error mapping, rate limit) │
   │                                   │                              │
   │                           lib/services  (business rules:         │
   │                           vouchers, GST, reports, members, OCR)  │
   │                           shared/ (pure JS: GST, money, GSTIN,   │
   │                           invoice parser) ◄── also bundled into  │
   │                           the Expo app                           │
   │                                   │                              │
   │                           lib/db  withOrg(ctx, fn):              │
   │                             BEGIN; SET LOCAL app.org_id,         │
   │                             app.user_id; ...; COMMIT             │
   └───────────────────────────────────┬──────────────────────────────┘
                                       │ role: shop_app (no BYPASSRLS, not owner)
                                       ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │ PostgreSQL                                                       │
   │  • RLS policies on every tenant table: org_id = app.org_id       │
   │  • Triggers: voucher must balance; audit log is append-only      │
   │  • Gap-free voucher numbering (row-locked counters)              │
   │  • Migrations owned by role shop_owner                           │
   └──────────────────────────────────────────────────────────────────┘
```

**Why one deployable (modular monolith)?** See [ADR-0004](adr/0004-nextjs-modular-monolith-rest-api.md).
The UI and API live in one Next.js app. The API is a clean, versioned REST surface
so the native app can use it unchanged later.

### Request flow (example: create a sales invoice)

1. Browser `POST /api/v1/orgs/{orgId}/vouchers` with JSON and the session cookie.
2. `lib/http` checks: same-origin (`Origin` header) for cookie requests, session valid
   and not expired, body is valid (zod schema), request size limits.
3. `lib/auth` loads the user's membership in `orgId` and checks the role may create
   vouchers (`cashier` and above).
4. `lib/services/vouchers` computes lines in integer paise: taxable value, CGST/SGST
   or IGST, round-off; builds the ledger entries (Party Dr, Sales Cr, Output GST Cr).
5. `withOrg()` opens a transaction, sets `app.org_id`/`app.user_id`, takes the next
   number from `voucher_sequences` with a row lock, inserts voucher + items + entries,
   writes the audit row, commits. The balance trigger runs at commit and rejects
   anything that does not sum to zero.
6. Response `201` with the voucher. The UI shows a printable invoice.

---

## 3. Deep dive

### 3.1 Accounting model (Tally-style double entry)

- **Groups** form a tree. Each root group has a *nature*: asset, liability, equity,
  income, expense. Reports roll ledgers up through groups.
- **Ledgers** are the accounts you post to: "Cash", "HDFC Bank", "Sales",
  "Output CGST", "Ramesh Traders" (a customer under Sundry Debtors).
- **Vouchers** are transactions. Each has ≥2 **entries**; an entry is
  `(ledger, amount)` where **positive = debit, negative = credit**. The sum of a
  voucher's entries must be exactly 0.
- **Item lines** (for sales, purchase, credit/debit notes) carry quantity, rate,
  discount, GST and a signed stock quantity (`+` in, `−` out). Stock on hand =
  opening quantity + sum of item quantities on non-cancelled vouchers.
- Cancelling a voucher keeps it (for audit and numbering) but excludes it from all
  balances and stock.

Default posting rules:

| Voucher | Debit | Credit |
|---|---|---|
| Sales | Party (or Cash) — invoice total | Sales A/c — taxable; Output CGST/SGST/IGST — tax; Round Off ± |
| Purchase | Purchase A/c — taxable; Input CGST/SGST/IGST — tax | Party (or Cash) — total |
| Receipt | Cash/Bank | Party |
| Payment | Party / Expense | Cash/Bank |
| Contra | Cash/Bank | Cash/Bank |
| Journal | any | any |
| Credit Note (sales return) | Sales A/c + Output tax | Party |
| Debit Note (purchase return) | Party | Purchase A/c + Input tax |

### 3.2 GST calculation

- Organization stores its GST state code (e.g. `23` = Madhya Pradesh).
- Each item voucher stores `place_of_supply` (state code). Same state → CGST and SGST
  at half the rate each; different → IGST at the full rate.
- Calculation per line in paise: `gross = qty × rate`, `taxable = gross − discount`,
  `tax = round(taxable × rate / 100)`. CGST = `floor(tax/2)`, SGST = `tax − CGST` so
  halves always add up exactly.
- Invoice total is rounded to the nearest rupee by default; the difference is posted
  to the **Round Off** ledger so the voucher still balances.
- Non-GST businesses (or businesses outside India) simply leave GST rates at 0 and
  GSTIN empty; everything else works the same.

### 3.3 Multi-tenancy and isolation

See [ADR-0001](adr/0001-postgres-rls-multi-tenancy.md). Summary:

- Shared database, shared schema, `org_id` column on every tenant table.
- RLS policy on each table: `org_id = current_setting('app.org_id')::uuid`.
- The app connects as `shop_app`, which does not own tables and cannot bypass RLS.
- Every request touching org data runs inside `withOrg(ctx, fn)` which does
  `SET LOCAL` inside a transaction, so settings cannot leak to the next request on a
  pooled connection.
- Membership/role is still checked in application code (RLS answers "which org",
  the app answers "may this user do this action").

### 3.4 Authentication

See [ADR-0003](adr/0003-session-auth.md).

- Passwords hashed with **scrypt** (Node built-in, memory-hard), per-user salt,
  parameters stored with the hash so they can be raised later.
- Sessions: a random 256-bit token is given to the client; only its SHA-256 hash is
  stored. Cookie `sid` is `HttpOnly`, `Secure` (in production), `SameSite=Lax`,
  `Path=/`. Native apps send `Authorization: Bearer <token>`.
- Sliding expiry (30 days idle, 90 days absolute). Sign out deletes the row.
- Login throttling: per email and per IP, counted in the database.

### 3.5 API design

Versioned REST, JSON, under `/api/v1`. Full list in [`API.md`](API.md).

```
POST   /api/v1/auth/signup | /auth/login | /auth/logout
GET    /api/v1/me
GET    /api/v1/orgs                       POST /api/v1/orgs
GET    /api/v1/orgs/{org}                 PATCH /api/v1/orgs/{org}
GET    /api/v1/orgs/{org}/members         POST .../invitations
GET    /api/v1/orgs/{org}/groups          POST ...
GET    /api/v1/orgs/{org}/ledgers         POST ...   PATCH .../ledgers/{id}
GET    /api/v1/orgs/{org}/units           POST ...
GET    /api/v1/orgs/{org}/items           POST ...   PATCH .../items/{id}
GET    /api/v1/orgs/{org}/vouchers?type=&from=&to=   POST ...
GET    /api/v1/orgs/{org}/vouchers/{id}   POST .../vouchers/{id}/cancel
GET    /api/v1/orgs/{org}/reports/{trial-balance|profit-loss|balance-sheet|day-book|ledger|stock-summary|gst-summary|outstanding}
```

Errors: `{ "error": { "code": "validation_failed", "message": "...", "details": {...} } }`
with proper status codes (400, 401, 403, 404, 409, 422, 429, 500).

### 3.6 Caching, queues, background work

**Now built** (see OPERATIONS.md): report cache keyed by a per-business data version, optional Redis,
BullMQ/Postgres job queue with a worker, feature flags, security log, Prometheus metrics. The text below
was the original plan.


None at first. Reports are SQL aggregates over indexed tables and are fast at the
expected size. Things we would add later, in this order:

1. A materialized monthly balance table per ledger if reports slow down.
2. A job queue (Postgres-based, e.g. `pg-boss`) for emails, PDF generation, exports.
3. Read replica for heavy reports.

### 3.7 Error handling

- All writes are single transactions; any error rolls back everything.
- Unique conflicts (duplicate ledger name, SKU) return `409`.
- Unexpected errors are logged with a request id and return a generic `500` — no
  stack traces or SQL to the client.

---

### 3.8 Code layout

```
app/            Next.js pages (web UI) and app/api/v1 route handlers (thin)
lib/            server-only: db context, http wrapper, auth, services/*
shared/         pure JS used by server, web and mobile (no Node/DOM/RN APIs)
db/migrations/  numbered SQL migrations (never edit an applied one)
mobile/         Expo app (own package.json); imports ../shared via Metro
test/           node:test integration tests against real Postgres as shop_app
scripts/        migrate, db-setup, smoke (HTTP end-to-end)
docs/           this documentation
```

## 4. Scale and reliability

**OCR load.** Tesseract is CPU-bound (~1 s per invoice photo on one core); one job runs at a time
per process. Phones with ML Kit do the OCR themselves and only send text. Scale OCR by running more
processes or moving it to a worker queue.

**Measured.** See [PERFORMANCE.md](PERFORMANCE.md): with 200 businesses plus one holding 30,000
vouchers, every report stays under 0.5 s and small businesses are unaffected.

**Load estimate.** 10,000 orgs × 50 vouchers/day = 500k vouchers/day ≈ 6/s average,
maybe 60/s peak. Each voucher ≈ 1 voucher row + ~4 entries + ~3 items ≈ 1–2 KB.
That is ~1 GB/day at the high end — fine for one Postgres for years, with
partitioning by `org_id` hash as a later option.

**Scaling path.** Next.js is stateless (sessions live in Postgres), so run N copies
behind a load balancer. Postgres scales vertically first, then read replicas for
reports, then partitioning.

**Backups.** Use a managed Postgres with point-in-time recovery. Owners/admins can also
download a complete JSON backup of their business (Settings → Download backup).

**Monitoring.** Structured JSON logs with request id, user id, org id, latency;
health endpoint `/api/health` (checks DB). Alert on 5xx rate and DB connection errors.

---

## 5. Trade-offs we accepted

| Decision | We gain | We give up | Revisit when |
|---|---|---|---|
| Shared schema + RLS | One migration path, cheap per tenant, strong isolation in DB | Must never connect as the table owner from the app; every query needs `org_id` | A tenant needs dedicated hardware or data residency |
| Monolith | Simple to run and debug | Can't scale UI and API separately | Team grows or API load dominates |
| Signed amounts (Dr +, Cr −) in one column | Balance check is a simple `sum = 0` | Reports must flip signs for display | Never, this is standard |
| Cancel, not delete | Audit trail, numbering stays gap-free | Data grows | Never |
| JavaScript + JSDoc + zod, not TypeScript | Matches existing code, no build step for types | Weaker compile-time checks | Codebase passes ~15k lines |
| Server-side sessions | Instant revocation, simple | One DB read per request | Very high traffic (add a cache) |

---

## 6. What we would revisit as it grows

- E-invoicing (IRN/QR) and e-way bill integration with the GST portal.
- Multi-currency, multiple godowns (warehouses), batches and expiry dates.
- Offline-first mobile app with sync (needs conflict rules; vouchers are append-only,
  which helps).
- Two-factor authentication for owners and admins.
- Tally XML export and data import (JSON backup export and CSV report exports are done).
