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

## Verified by tests
`test/isolation.test.js` (raw SQL as the app role cannot cross tenants, cannot disable RLS,
cannot delete vouchers/audit), `test/vouchers.test.js` (balance trigger, immutability),
`test/members.test.js`, `test/auth.test.js`, and `scripts/smoke.mjs` over HTTP (CSRF,
cross-org 404s, forged sessions, bearer flow).

## Known gaps / next steps
- Email verification and password reset need an email provider (not set up yet).
- Two-factor authentication (TOTP) for owners/admins.
- Sign-up reveals whether an email already has an account (accepted trade-off for usability).
- Per-IP throttling needs `TRUST_PROXY=1` behind a proxy that sets `X-Forwarded-For`.
- Backups/PITR are the hosting provider's job; test restores regularly.
- Run `npm audit` and keep Next.js patched (CI does this).
