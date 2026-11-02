# Security model

## Threats we design against
1. A user of one business reading or changing another business's data.
2. A staff member doing more than their role allows (e.g. a cashier cancelling invoices).
3. Silent tampering with posted accounts.
4. Account takeover (password guessing, stolen session, CSRF).
5. Injection (SQL, XSS) and clickjacking.

## Controls

| Threat | Control | Where |
|---|---|---|
| Cross-tenant access | Postgres RLS (enabled + forced) on every tenant table; app role cannot bypass; composite FKs; org id in URL checked against membership (404 if not a member) | `001_init.sql`, `lib/db.js#withOrg`, `lib/http.js` |
| Role abuse | Permission matrix checked on every route; admins cannot manage owners/admins; last owner cannot leave | `lib/permissions.js`, `lib/services/orgs.js` |
| Tampering | Vouchers append-only (column-level grants + trigger), cancel with reason, balance trigger, append-only audit log | `001`, `003`, `lib/services/vouchers.js` |
| Password guessing | scrypt hashes; 10 failures / 15 min per email; per-IP limits when `TRUST_PROXY=1`; same timing for unknown emails | `lib/auth/*`, `lib/services/accounts.js` |
| Session theft | 256-bit random token, only SHA-256 stored; `HttpOnly; SameSite=Lax; Secure` in production; 30-day sliding / 90-day absolute expiry; password change signs out other devices | `lib/auth/session.js` |
| CSRF | Cookie requests that change data must carry an allowed `Origin`; JSON-only bodies; bearer requests are not sent automatically by browsers | `lib/http.js` |
| SQL injection | Parameterized queries only; dynamic column lists come from fixed whitelists | `lib/services/*` |
| XSS | React escaping; strict nonce-based CSP with `strict-dynamic`; no `dangerouslySetInnerHTML` | `proxy.js` |
| Clickjacking | `X-Frame-Options: DENY`, `frame-ancestors 'none'` | `next.config.mjs`, `proxy.js` |
| Invitation leaks | One-time token, stored hashed, bound to the invited email, 7-day expiry, carried in the URL fragment so it is never sent to servers/logs | `lib/services/orgs.js`, `app/invite` |
| Oversized input | 256 KB JSON body limit, zod length limits, 15 s statement timeout | `lib/http.js`, `lib/validation.js`, `lib/db.js` |
| Error leaks | Generic 500 with request id; details only in server logs | `lib/http.js` |
| Open redirect | `?next=` accepts only same-site relative paths | `app/ui/AuthForm.js` |
| Malicious uploads (OCR) | JPEG/PNG only by magic bytes (SVG/GIF refused), ≤ 8 MB, dimensions read from headers and capped at 40 MP before decoding (decompression bombs), ≥ 200 px, 45 s timeout, one job at a time, 60 images/hour/user; images never stored | `lib/services/ocr.js`, `app/api/v1/orgs/[orgId]/ocr/*` |
| OCR data leaks | Matching of supplier/items runs under RLS; drafts are not stored; on-device OCR uploads text only; no third-party OCR service | `lib/services/ocr.js`, ADR-0007 |
| GSTIN typos / spoofed scans | GSTIN check digit validated on every save and in the parser | `shared/gstin.js` |
| Mobile token theft | Token in SecureStore (Keystore), device-only; cookies never used by the app; `allowBackup=false`; 401 wipes token | `mobile/src/lib/api.js` |
| Mobile MITM | https required for the server address (http only for private LAN during testing) | `mobile/src/lib/url.js` |
| Unverified sign-ups | Email confirmation (one-time hashed 24 h links) required before creating/joining a business when email is configured | `lib/services/verification.js` |
| Host-header poisoning of email links | Links built only from `APP_ORIGIN` in production (request Host ignored); missing setting fails closed | `lib/http.js#publicOrigin` |
| Header injection via names | Names reject CR/LF and control characters | `lib/validation.js` |
| Email injection / spoofed content | Escaped HTML templates; links built from `APP_ORIGIN`; SMTP requires TLS to remote hosts | `lib/emailTemplates.js`, `lib/email.js` |
| AI data exposure | Off by default (server + per business); facts only; names hidden from cloud models by default; no narrations/contacts; audit entry per request | `lib/services/aiSummary.js`, ADR-0008 |
| AI prompt injection | Model has no tools and no data access; facts wrapped and declared as data; output rendered as plain text | `lib/services/aiSummary.js` |
| SSRF via AI | AI base URL comes only from server env, https required for non-local hosts, redirects refused | `lib/ai/index.js` |
| Undetected attacks | Security event log (sign-ins, failures, throttling, denials, rate limits, password/session/role changes, exports); per-user view + device sign-out; metrics for alerting | `lib/services/securityLog.js`, OPERATIONS.md |
| Risky feature in production | Feature flags with kill switch (`FLAG_X=off`) and gradual rollout | `lib/flags.js` |
| Container breakout / lateral movement | Non-root image, read-only root FS, all capabilities dropped, seccomp, no k8s API token, NetworkPolicies, web pods without migration credentials | `Dockerfile`, `deploy/k8s` |
| Malicious images | sharp with a 40 MP pixel limit (decompression bombs), allowed formats only (no SVG), all metadata stripped (GPS), re-encoded to WebP; storage keys validated (no path traversal) | `lib/images.js`, `lib/storage.js` |
| Private images via CDN | HMAC-signed, expiring URLs; content-addressed keys; images belong to one business (RLS + composite FKs) | `lib/images.js`, `019_images_outbox.sql` |
| Event leaks | Kafka events contain ids/amounts only; outbox written in the same transaction | `lib/events.js` |
| Queued secrets | Job payloads encrypted in Postgres and wiped after success | `lib/queue.js` |
| Stolen database / backup | Contact details (phone, email, address) encrypted with AES-256-GCM (`DATA_ENCRYPTION_KEY`); passwords and tokens hashed; see DATA_PROTECTION.md | `lib/crypto.js` |
| Import abuse | 5000 rows / 4 MB max, every row validated like a form, one transaction, audited | `lib/services/importData.js` |
| Cashier abuse of bills | Receipts are "money in" only, bills post to Sales/Purchase ledgers, cashiers cannot change GST rates or set opening balances (F-14..F-16) | `lib/services/vouchers.js`, `lib/services/masters.js` |
| Password guessing bursts | Each guess is reserved before checking; limit per email+IP when the IP is known; change-password limited | `lib/auth/rate-limit.js` (`reserveFailure`) |
| Leaking details to unauthorised users | Voucher creation checks permission before validating the body | `app/api/v1/orgs/[orgId]/vouchers/route.js` |
| Notification privacy | Rows belong to one recipient; RLS limits read/update to `user_id = app.user_id` in the current business; app cannot delete or edit text; links must be in-app paths (CHECK constraint) | `010_notifications.sql` |
| Customer spam via reminders | 3 per customer per day, 200 per business per day; only to the customer's saved contact; audited | `lib/services/reminders.js` |
| Injection into shared PDFs | Invoice HTML escapes every value and carries a deny-all CSP | `mobile/src/lib/invoiceHtml.js` |

## Verified by tests
`test/isolation.test.js` (raw SQL as the app role cannot cross tenants, cannot disable RLS,
cannot delete vouchers/audit), `test/vouchers.test.js` (balance trigger, immutability),
`test/members.test.js`, `test/auth.test.js`, `test/ocr.test.js` (upload guards, tenant-scoped matching),
`test/invoiceParser.test.js` (hostile input), `test/permissions.test.js` (every role × every endpoint
through the real HTTP handlers; outsiders get 404, anonymous 401), `mobile/test/pure.test.mjs` (URL policy, HTML escaping), and
`scripts/smoke.mjs` over HTTP (CSRF, cross-org 404s, forged sessions, bearer flow, mobile flow, OCR).

Security testing rounds (probes, load run, dependency check) and every finding with its fix and test:
**[SECURITY_FINDINGS.md](SECURITY_FINDINGS.md)**. Probes: `scripts/security/probe.mjs`, `probe2.mjs`, `burst.mjs`.

## Known gaps / next steps
- Password reset is built (one-time 30-minute links, hashed tokens, same answer for unknown emails, signs out
  everywhere). It needs an email provider in production: set `RESEND_API_KEY` and `EMAIL_FROM`.
- Email verification is built (see docs/EMAIL.md).
- Two-factor authentication (TOTP) for owners/admins.
- Sign-up reveals whether an email already has an account (accepted trade-off for usability).
- Per-IP throttling needs `TRUST_PROXY=1` behind a proxy that sets `X-Forwarded-For`; the client IP is read
  `TRUSTED_PROXY_HOPS` entries from the right (default 1). Without it, sign-in limits are per email (see O-02).
- Backups/PITR are the hosting provider's job; test restores regularly.
- Run `npm audit` and keep Next.js patched (CI does this).
