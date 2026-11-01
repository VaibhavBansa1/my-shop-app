# Handoff — status and next steps

_Last updated: 2026-11-01. Branch: `claude/zealous-hamilton-jccxrq`._

This file lets anyone (you on your PC, or a new Claude session) continue the work.

## Where things stand

**Done and tested**
- Architecture, database design, security model, API and 5 ADRs (`docs/`).
- PostgreSQL schema with Row-Level Security multi-tenancy, double-entry vouchers, balance and
  immutability triggers, audit log, least-privilege app role (`db/migrations/001–006`).
- Services: accounts, organizations/members/invitations, masters, voucher engine with GST,
  reports (`lib/services/`).
- REST API v1 (`app/api/v1/`) used by the web UI; bearer tokens for native apps.
- Mobile-first web UI (`app/`), light and dark mode, printable invoices.
- 21 automated tests (`npm test`) + 18 HTTP smoke checks (`npm run smoke`); CI workflow in
  `.github/workflows/ci.yml`; `npm audit` clean (Next 16.4.3, zod 4.6.7).
- Screenshots in `docs/screenshots/`.

**Old code removed:** the single-tenant `app/api/*` routes, `schema.sql` and OCR invoice import
(tesseract/pdf.js). They had no auth and no tenant isolation; the old data model is replaced by vouchers.

## Resume on your PC
1. `git fetch origin && git checkout claude/zealous-hamilton-jccxrq`
2. `npm install`
3. `docker compose up -d` (or use your own Postgres and set `SUPERUSER_URL`)
4. `npm run db:setup`
5. `npm test` then `npm run dev` → http://localhost:3000

To keep going with Claude Code locally, open the folder and say: *"Read docs/HANDOFF.md and continue
with the next item in the backlog."*

## Backlog (suggested order)
1. **Edit = cancel and re-enter helper** in the UI (copy a voucher into a new form).
2. **Password reset and email verification** (needs an email provider such as Resend/SES).
3. **Item batches / multiple godowns**, purchase-side cost methods (FIFO) if needed.
4. **Exports:** Excel/CSV for reports, Tally XML export, JSON backup per organization.
5. **Invoice PDF + WhatsApp share**; invoice templates and business logo.
6. **GST e-invoice (IRN/QR) and e-way bill** integration.
7. **TOTP two-factor** for owners/admins; session list with "sign out this device".
8. **Native app:** React Native (Expo) or Kotlin/Android Studio against `/api/v1` with bearer tokens.
   Start with: login, new sale, today's sales, stock lookup. Offline queue later (vouchers are
   append-only, which keeps sync simple).
9. Performance: monthly balance snapshots if reports slow down over many years.

## Gotchas
- `DATABASE_URL` must use `shop_app`, never the owner/superuser, or RLS is bypassed.
- Never edit an applied migration; add `007_*.sql`.
- Membership queries must filter `org_id = app_org_id()` (the policy also shows your own rows in other orgs).
- `zod` 4: use `patchOf()` from `lib/validation.js` for PATCH schemas (`.partial()` keeps defaults).
- `TRUST_PROXY=1` only behind a proxy that sets `X-Forwarded-For`.
