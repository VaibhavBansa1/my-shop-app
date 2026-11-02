# Handoff — status and next steps

_Last updated: 2026-11-01. Branch: `claude/zealous-hamilton-jccxrq`._

This file lets anyone (you on your PC, or a new Claude session) continue the work.

## Where things stand

**Web app + API (root)**
- Multi-tenant accounting/inventory/GST with Postgres RLS; migrations `001–006`.
- REST API v1 for web and mobile; nonce CSP, CSRF origin checks, rate limits.
- Invoice scanning: `POST /ocr/invoice` (photo) and `/ocr/parse` (text), shared parser, review UI on
  the New Purchase page.
- Correct a voucher (web: all types; app: sales bills) — new voucher + cancel original in one transaction.
- CSV export for every report and the voucher list (formula-injection safe); website installable (manifest).
- Email: SMTP/Resend/Mailpit; account verification (migration 008); invitation + welcome emails.
- Optional AI summaries (migration 009) via Ollama, LM Studio, Groq, OpenRouter, xAI, OpenAI — docs/AI.md.
- Field rules decided and enforced (docs/FIELDS.md); glossary (docs/GLOSSARY.md); both shown in-app at /help.
- Scale tested: 200 businesses + one with 30,000 vouchers, all reports < 0.5 s (docs/PERFORMANCE.md).
- JSON backup export per business (Settings → Download backup).
- Notifications (cancelled bills, low stock, new members, daily summary via `npm run notify:daily`) and
  payment reminders by WhatsApp/SMS/email with UPI ID — docs/NOTIFICATIONS.md. Camera permission verified.
- CSV import (items, customers/suppliers) with preview and all-or-nothing save; stock adjustments and
  physical stock count (migrations 013/014); contact details encrypted with AES-256-GCM (migration 012,
  `DATA_ENCRYPTION_KEY` required in production); one-firm auto-open and multi-firm overview.
- Operations (docs/OPERATIONS.md): JSON logs + request ids, Prometheus metrics, health/readiness,
  feature flags (`npm run flags`), security event log + device sign-out, optional Redis, BullMQ/Postgres
  job queue + worker (`npm run worker`), report cache, Dockerfile + compose stack, Kubernetes manifests.
- Item photos + business logo with sharp, local/S3 storage, signed CDN-cacheable URLs (docs/OPERATIONS.md);
  optional Kafka event stream via a transactional outbox (ADR-0009).
- Password reset by email (Resend via env, dev logs the link); `npm run db:cleanup` for a daily cron.
- Tests: `npm test` (79, incl. images, Kafka outbox (real broker test with TEST_KAFKA_BROKERS), ops/flags/queue, encryption, import, stock adjustments, notifications and reminders, role x endpoint matrix, OCR on a real image, AI with a fake model server, real SMTP delivery), `npm run smoke` (27 HTTP checks incl. the mobile flow).

**Android app (`mobile/`)**
- Expo SDK 58 app: sign in/up (+ forgot password), businesses, home, sell with exact GST preview, correct a bill, add stock items, vouchers with PDF share and
  cancel, stock, receipts/expenses, parties and ledger statements, reports, invoice scanning
  (on-device ML Kit with server fallback).
- Checks: `npm test`, `npx expo-doctor` (20/20), `npx expo export --platform android` bundles.
- Not yet run on a physical phone (no Android SDK in the cloud container) — see MANUAL_TESTING.md.

**Docs:** ARCHITECTURE, DATABASE, SECURITY, API, MOBILE, OCR, MANUAL_TESTING, ADRs 0001–0007.
**CI:** `.github/workflows/ci.yml` runs server tests + audit + build, and mobile tests + doctor + bundle.

## Resume on your PC
1. `git fetch origin && git checkout claude/zealous-hamilton-jccxrq`
2. `npm install` then `docker compose up -d` then `npm run db:setup`
3. `npm test` then `npm run dev` → http://localhost:3000
4. Mobile: `cd mobile && npm install && npx expo run:android` (see docs/MOBILE.md)

To keep going with Claude Code locally: *"Read docs/HANDOFF.md and continue with the backlog."*

## Backlog (suggested order)
1. Owner decisions in docs/MANUAL_TESTING.md (package id, server URL, open sign-up, legal pages).
2. Configure real email (docs/EMAIL.md) and test AI with your Ollama (docs/AI.md).
4. Mobile: edit stock items, date picker, offline queue for sales, CSV share.
5. Tally XML export; importing data from Tally/Excel (CSV and JSON backup exports are done).
6. GST e-invoice (IRN/QR) and e-way bill.
7. TOTP two-factor for owners/admins; list of signed-in devices.
8. Optional cloud OCR for low-confidence scans (needs owner consent + data agreement).

## Gotchas
- `DATABASE_URL` must use `shop_app`, never the owner/superuser, or RLS is bypassed.
- Never edit an applied migration; add `007_*.sql`.
- Membership queries must filter `org_id = app_org_id()` (the policy also shows your own rows in other orgs).
- `zod` 4: use `patchOf()` from `lib/validation.js` for PATCH schemas (`.partial()` keeps defaults).
- `shared/` must stay pure JS (runs in Node and Hermes).
- In `mobile/`, install packages with `npx expo install`, not plain npm.
- After the cloud container restarts, Postgres must be started again (`service postgresql start`), and Redis
  (`redis-server --daemonize yes`) and Docker (`dockerd &`) if you use them.
- `next.config.mjs` uses `output: 'standalone'` for Docker; `npm start` still works locally.
