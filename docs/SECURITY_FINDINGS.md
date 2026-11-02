# Security findings — testing log

_Last updated: 2026-11-02. Scope: this repository only (web app, API, database, Expo app tooling)._

This page records every security problem found by our own testing, how bad it was, what was done, and the
test that keeps it fixed. It also lists what is **still open** and what was **accepted on purpose**.

## How the testing was done

All testing ran against a **local** server and a **local test database** in the development container — never
against anyone else's system. Five methods were used:

1. **Code review.** The code was read area by area: sign-in and sessions; tenant isolation, row-level security
   and SECURITY DEFINER functions; roles; business rules; images; idempotency.
2. **HTTP probes against the running app.** `scripts/security/probe.mjs` has 13 checks (round 1) and
   `scripts/security/probe2.mjs` has 51 checks (round 2).
   - They cover dates, NUL bytes, overflow, double taps, owner races, prototype keys, OCR floods and
     cross-business ids.
   - They also cover sessions, CSRF variants, the role matrix, invitation races, cancel and correct races,
     rate limits, image signature tampering and path traversal, SVG uploads, decompression bombs and headers.
3. **Regression tests.** Every fix has a test in `npm test` (`test/security-round2.test.js`, plus round-1
   tests in `vouchers.test.js`, `members.test.js` and `ocr.test.js`).
4. **A short, bounded load run.** `scripts/security/burst.mjs`, capped at 120 seconds.
5. **A dependency check.** `npm audit` for the web app and the mobile app.

Run them again:

```bash
npm test                                   # 96 tests (1 skipped without a Kafka broker)
node scripts/security/probe.mjs            # needs the app on http://localhost:3000
node scripts/security/probe2.mjs
node scripts/security/burst.mjs 20 20      # 20 clients x 20 seconds
```

## Summary

| Result | Count |
|---|---|
| Found and fixed, with a test | 24 (1 High, 10 Medium, 13 Low) |
| Data leak between businesses | **none found** |
| Still open (accepted or partly fixed) | 6, listed below |
| Library problems needing an upstream issue | none confirmed; one advisory note for Expo tooling |

Severity: **High** means a real attacker or normal use causes lasting damage. **Medium** means it needs a
logged-in user or a particular setup, or the damage can be undone. **Low** means hardening, or the impact is
small.

## Round 1 (commit 4b90957)

| ID | Severity | Problem | Fix | Test |
|---|---|---|---|---|
| F-01 | High | Two owners demoting each other at the same moment could leave a business with **no owner** (check-then-act race). | Owners and the target are locked in a fixed order; the actor's role is re-checked under the lock; deadlocks become 409 "try again". | `members.test.js` (owner race), probe #5 |
| F-02 | Medium | Double-tapping Save, or a retry on a bad network, created **duplicate bills**. | `Idempotency-Key` on `POST /vouchers` (migration 020); web and app send one key per Save. | `vouchers.test.js` (idempotency), probe #4 |
| F-03 | Medium | NUL characters in text caused a 500 error (narration) or were stored (address). | JSON with NUL in any string is refused (400), CSV import included. | `vouchers.test.js` (validation hardening), probe #2 |
| F-04 | Medium | OCR had an **unbounded waiting line** (memory and latency denial of service). | Load shedding: beyond `OCR_MAX_QUEUE` (default 4) the server answers 503 with `Retry-After`. | `ocr.test.js`, probe #7 |
| F-05 | Low | Impossible dates (2026-02-30) were only caught by Postgres. | Strict calendar check (1900–2199) with a clear 422 message. | `vouchers.test.js`, probe #1 |

## Round 2 (this commit)

### Sign-in, sessions and links

| ID | Severity | Problem | Fix | Test |
|---|---|---|---|---|
| F-06 | Medium | **Open redirect after sign-in.** `/login?next=/%09/evil.com` passed the old prefix checks; browsers drop the tab, so the user landed on `evil.com` (useful for phishing). | `shared/safeNext.js` parses `next` with the URL parser, requires the same origin, and refuses control characters and backslashes. | F-06 test |
| F-07 | Medium | **Invitation squatting.** Invitations are tied to an email address, but with `EMAIL_VERIFICATION=optional` anyone could sign up with that address (never proving they own it), open a forwarded link and join. | Accepting an invitation now needs a confirmed email whenever verification is not `off`. With no email set up at all (`off`), the team page warns the inviter to send the link only to that person. See open item O-01. | F-07 test |
| F-08 | Medium (depends on proxy) | With `TRUST_PROXY=1`, the client IP was read from the **left** of `X-Forwarded-For`, which the client controls. nginx, Caddy, Traefik and Cloudflare append to it, so per-IP limits could be dodged and logged IPs forged. | The IP is taken from the right, `TRUSTED_PROXY_HOPS` entries in (default 1). | F-08 test |
| F-09 | Low/Medium | **Anyone could lock an account out of sign-in** by failing 10 times in 15 minutes, which also blocked the right password. | When the client IP is known, the tight limit (10) is per email+IP. A looser per-email cap (100) still stops distributed guessing. Without `TRUST_PROXY` the per-email limit stays (open item O-02). | F-09/F-10 test |
| F-10 | Low | **Parallel guesses passed the limit.** The count was checked before scrypt and recorded after, so 200 simultaneous requests all saw "9 so far". | `reserveFailure()` records the attempt first, then counts (atomic in Redis, insert-then-count in Postgres). | F-09/F-10 test: 30 parallel tries, at most 10 checked |
| F-11 | Low | With a stolen session, the **current password could be guessed without limit** on the change-password form. | 5 wrong tries per 15 minutes per user. | F-11/F-13 test |
| F-13 | Low | A **reset link requested earlier still worked after a password change**, for up to 30 minutes. | Changing the password marks open reset links as used. | F-11/F-13 test |
| F-23 | Low | The invitation token went into a **URL query string** (`GET /invitations/accept?token=…`), so it could end up in proxy or CDN access logs. The page also left it in the address bar. | The preview is now `POST {token, preview:true}` and the GET is removed. The page clears the fragment with `history.replaceState`. | probe2 (invitations) |

### Roles and business rules

All of these were problems inside one business (a cashier doing more than a cashier may); none crossed businesses.

| ID | Severity | Problem | Fix | Test |
|---|---|---|---|---|
| F-14 | Medium | A **cashier's receipt could be a disguised journal**. For example, Cash Dr 1 + Capital Dr 9,999 / Customer Cr 10,000 wiped a customer's dues. Cash Dr / Bank Cr was a contra. | For roles that cannot post journals, every debit must be cash/bank and no credit may be. Accountants keep the flexible form (e.g. a discount line). | F-14 test |
| F-15 | Medium | A **sales bill could post to any ledger** (another customer, Capital) through `accountLedgerId`. A cashier could also **set GST to 0%** per line. | The account ledger must be under Sales Accounts (or Purchase Accounts) and active. Cashiers cannot change it or the item's GST rate. | F-15 test |
| F-16 | Medium | A **cashier could create a customer with an opening balance** (e.g. a −50,000 credit that hides later credit sales). The audit log recorded only the name. | Cashiers cannot set an opening balance; the amount is now audited. | F-16 test |
| F-18 | Low | Changing the **financial-year start month after bills existed** restarted numbering, so the same invoice number could print twice (a GST compliance problem). | FY start is locked once any voucher exists (same rule as "books begin"). | F-18/F-20 test |
| F-12 | Low | The **duplicate supplier-bill check was check-then-act**, so two people saving the same bill at once both got in. | A transaction advisory lock on (business, supplier, bill number) serialises them. | F-12 test |
| F-21 | Low | An **admin could cancel an invitation the owner sent for another admin**. | Cancelling uses the same rule as inviting (`canManageRole`). | F-21 test |

### Data integrity, privacy and housekeeping

| ID | Severity | Problem | Fix | Test |
|---|---|---|---|---|
| F-22 | **Medium** (data loss) | **The daily cleanup deleted item photos that were still in use.** `orphan_images()` runs as `shop_owner`, but `stock_items` had no policy for that role, so under forced row-level security the "used by an item?" check saw no items. Files of every item photo older than a day were deleted (the row survived because of the foreign key). Found by our own regression test. | Migration 022 adds the narrow read-only owner policy. | F-17 test ("in use") |
| F-17 | Low | `delete_image(uuid)` deleted any id it was given, and a re-upload racing the cleanup could share storage keys with the copy being deleted. | Migration 021: `delete_image` re-checks "old and unused" at delete time and returns whether it deleted. The job deletes files only after the row is gone. Storage keys are now unique per upload. | F-17 test |
| F-19 | Low (defence in depth) | The database allowed **adding lines to an existing voucher** (the app never does). | Trigger: lines can only be inserted in the transaction that created the voucher. | F-19 test |
| F-20 | Low | **Cached reports did not refresh after settings changes** (e.g. books start date), for up to 10 minutes. The **activity log stored phone/email/address in plain text**, which undid field encryption. | Settings updates bump `data_version`; the audit log records "(changed)" for contact fields. | F-18/F-20 test |
| F-24 | Low | If the server crashed between saving a bill and storing its idempotent response, the key **stayed "processing" for 24 hours**. | The response is stored in the same transaction as the bill (`beforeCommit`). | `vouchers.test.js` (idempotency) |
| — | Low | The daily summary ignored per-business allow/deny lists of the `daily_summary` flag. | Checked per business. | `notifications.test.js` |

## Open items and accepted risks

| ID | What | Why it stays | What to do |
|---|---|---|---|
| O-01 | With **no email provider** (`EMAIL_VERIFICATION=off`), an invitation cannot prove who opens it. | Nothing can confirm an address without email. The inviter is warned on the team page. | Set up email in production (docs/EMAIL.md). Then `required` is the default. |
| O-02 | Without `TRUST_PROXY=1`, sign-in limits are **per email only**, so an attacker can keep one account locked (F-09). | Without a trusted client IP there is nothing better to key on. | Run behind a proxy with `TRUST_PROXY=1` (and `TRUSTED_PROXY_HOPS`). Later: CAPTCHA or an emailed unlock link. |
| O-03 | **Sign-up reveals** whether an email already has an account. | Usability trade-off (documented in SECURITY.md); rate-limited. | Revisit if needed: "check your inbox" sign-up flow. |
| O-04 | **Signed image URLs** work for anyone who has them until they expire (they rotate daily). | Needed for CDN caching. | Do not paste image links publicly. |
| O-05 | Reminder limits (3 per customer per day) are check-then-act, so a burst of parallel clicks can send a few extra. | Bounded, low impact; only to the customer's saved contact. | Use `reserveFailure`-style reservation if it matters. |
| O-06 | No `__Host-` cookie prefix; CSP allows inline *styles* (not scripts). | Low impact; `__Host-` needs HTTPS in development too. | Consider `__Host-sid` in production. |
| O-07 | Expo **build tooling** shows 12 *moderate* `npm audit` advisories (`glob`, `minimatch` inside `@expo/cli` / `@expo/config`). | These run on the developer's computer while building, not inside the app on the phone. `npm audit fix --force` would downgrade to Expo 51 (wrong). | Update when Expo ships patched versions (`npx expo install --fix`). The web app has **0** advisories. |

## Load run (bounded)

`node scripts/security/burst.mjs 20 20` on the development container (one Next.js process, local Postgres):

- **Requests:** 2,042 in 20 seconds (about 100 per second), with **no 5xx errors**.
- **Sales bill:** p50 275 ms, p95 526 ms.
- **Reports (dashboard, trial balance, P&L):** p50 150–170 ms, p95 under 0.5 s.
- **Import:** 5,000 items imported in one request in 4.4 s.
- **Under OCR flood:** 20 photos at once produce fast 503 "busy" answers instead of a pile-up (probe #7).

## Library issues

None of the round 1 or round 2 problems were caused by a library bug. All were in this app's own code or
configuration. The note below needs no upstream issue, since the advisories are already public. It is kept
here for whoever updates Expo:

> **Expo CLI pulls vulnerable `glob`/`minimatch` versions (dev tooling only).**
> - Reproduce: `cd mobile && npm audit --omit=dev`, which lists GHSA-g3hv-75wg-m249 (minimatch ReDoS) and the
>   `glob` AbortSignal advisory through `@expo/cli`, `@expo/config` and `@expo/fingerprint`.
> - Impact: developer machine or CI only, and only with attacker-controlled glob patterns.
> - Suggested fix: Expo bumps `glob`/`minimatch` in its next SDK patch. Track it and run `npx expo install --fix`.
