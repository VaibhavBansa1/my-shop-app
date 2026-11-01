# My Shop App

Tally-style **accounting, inventory and GST billing** for shops, as a web app that works on
phones and computers. Anyone can sign up, create their business, invite staff with roles, and
work in a private space isolated at the database level.

**Stack:** Next.js 16 (App Router) · PostgreSQL 14+ with Row-Level Security · `pg` · zod · Node 20+.

![Dashboard on a phone](docs/screenshots/dashboard-phone-light.png)

## Features
- Sign up / sign in, multiple businesses per user, invite staff (owner, admin, accountant, cashier, viewer)
- Chart of accounts seeded like Tally (groups and ledgers), customers and suppliers with GSTIN/state
- Stock items with units, HSN, GST rate, prices, reorder level, opening stock
- Vouchers: Sales, Purchase, Receipt, Payment, Contra, Journal, Credit Note, Debit Note — double entry,
  always balanced, gap-free numbering per financial year, cancel (never delete)
- GST: CGST+SGST or IGST by place of supply, round-off, printable tax invoice
- Reports: Day Book, Ledger, Trial Balance, Profit & Loss, Balance Sheet, Stock Summary, GST Summary,
  Receivables / Payables, dashboard
- Audit log of every change; REST API ready for a native app

## Run it on your computer

Needs **Node 20+** and **PostgreSQL** (or Docker).

```bash
git clone https://github.com/VaibhavBansa1/my-shop-app.git
cd my-shop-app
npm install
```

Start Postgres (skip if you already have one; then set `SUPERUSER_URL`):

```bash
docker compose up -d
```

Create the database roles, dev/test databases and run migrations:

```bash
npm run db:setup
```

Start the app and open http://localhost:3000:

```bash
npm run dev
```

To open it from your phone on the same Wi-Fi, use `http://<your-PC-IP>:3000` and add that to
`APP_ORIGIN` in `.env.local` (comma-separated), e.g. `APP_ORIGIN=http://localhost:3000,http://192.168.1.20:3000`.

## Tests

```bash
npm test
```

Runs unit tests and integration tests against the `shop_test` database **as the real app role**
(tenant isolation, voucher rules, reports, members, auth). With the app running:

```bash
npm run smoke
```

## Documentation
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, requirements, trade-offs
- [docs/DATABASE.md](docs/DATABASE.md) — every table and rule
- [docs/SECURITY.md](docs/SECURITY.md) — threat model and controls
- [docs/API.md](docs/API.md) — REST API for web and native apps
- [docs/adr/](docs/adr/) — architecture decision records
- [docs/HANDOFF.md](docs/HANDOFF.md) — current status and what to build next

## Deploying
Any Node host plus managed Postgres. Set `DATABASE_URL` (shop_app role), `DATABASE_OWNER_URL`
(for migrations only), `APP_ORIGIN=https://your-domain`, `NODE_ENV=production`, and `TRUST_PROXY=1`
if behind a proxy/load balancer. Run `npm run db:migrate` on each deploy, then `npm run build && npm start`.
