# Performance and scale

Measured with `node scripts/loadtest.mjs 200 30000` (wipes and uses the **test** database) on the
development cloud container: 4 vCPU, PostgreSQL 16 with default settings, Node 22, everything on one machine.

## What was loaded
- **200 small businesses**, each with 5 items, 5 customers and 50 vouchers.
- **1 large business** with 300 items, 500 customers and **30,000 vouchers** (70% sales with 2 lines,
  10% purchases, 10% receipts, 10% payments) — about 7 months at ~140 bills a day.
- Database size afterwards: **90 MB**.

## Results
| Report | Large business (30,000 vouchers) | Small business, same database |
|---|---|---|
| Dashboard | 112 ms | 3 ms |
| Trial balance | 145 ms | 2 ms |
| Profit & Loss (full year) | 229 ms | 4 ms |
| Balance sheet | 453 ms | 8 ms |
| Stock summary | 90 ms | 2 ms |
| GST summary | 67 ms | 1 ms |
| Receivables | 150 ms | 3 ms |
| Day book (one day) | 2 ms | 1 ms |
| Ledger statement | 4 ms | 1 ms |
| Voucher list (latest 100) | 2 ms | 2 ms |

Writing: **~220 vouchers per second** with 8 parallel writers (each voucher: numbering lock, header,
entries, items, balance trigger, audit row, all in one transaction).

## What this means
- A typical shop (50–300 bills a day) stays far below these numbers for years.
- One big business does not slow small ones down: row-level security plus `(org_id, …)` indexes keep
  each business's queries to its own rows.
- Thousands of small businesses fit comfortably on one Postgres server.

## Re-measured after adding operations features (Nov 2026, 50 + 1 businesses, 30,000 vouchers)
| | Before | After |
|---|---|---|
| Balance sheet (large business) | 411 ms | **192 ms** (P&L and balance sheet now share balances and stock valuation) |
| Writes, 8 parallel writers in one business | 88/s (cache-version lock held for the whole save) | **123/s** (version bumped at commit) |
Writes are below the very first measurement (218/s) because every sale now also checks low stock, raises
alerts and bumps the cache version. 123/s ≈ 10 million vouchers a day for one business — far beyond any shop.
Reports are additionally **cached** per business until the data changes, so repeated views cost ~1 ms.

## When to optimise (in this order)
1. Balance sheet / P&L over many years for very large businesses → add monthly balance snapshots
   per ledger (designed in ARCHITECTURE §6).
2. Many concurrent users → run more app processes behind a load balancer (the app is stateless) and
   use a connection pooler (PgBouncer in transaction mode works with our `SET LOCAL` design).
3. OCR load → move OCR to a worker process/queue.
4. Read-heavy reporting → a Postgres read replica.
