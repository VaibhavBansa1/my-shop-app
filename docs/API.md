# REST API v1

Base path `/api/v1`. JSON in and out. The web app and future native apps use the same API.

## Authentication
- **Web:** `POST /auth/login` sets an `HttpOnly` cookie `sid`. Requests that change data must come
  from the app's own origin (`Origin` header checked).
- **Native:** `POST /auth/login` with `"returnToken": true` returns `{ token }`; send
  `Authorization: Bearer <token>` on every request. No Origin needed.
- **Two-step login:** if the account has it on, `POST /auth/login` answers `401 {error:{code:"mfa_required"}}` after a correct
  password; send the same request again with `"code": "123456"` (or a recovery code like `"abcde-fghij"`). Wrong codes → `mfa_invalid`.

## Errors
```json
{ "error": { "code": "validation_failed", "message": "Quantity on line 1 must be more than 0.", "details": [] } }
```
Codes: `bad_request` 400, `unauthorized` 401, `forbidden` 403, `not_found` 404 (also used for orgs you
are not a member of), `conflict` 409, `validation_failed` 422, `rate_limited` 429, `internal` 500.

Money may be sent as numbers or decimal strings (`"510.50"`); responses use numbers in rupees.
Dates are `YYYY-MM-DD`.

## Endpoints

| Method | Path | Role needed | Notes |
|---|---|---|---|
| POST | `/auth/signup` | — | `{name, email, password, returnToken?}` (password ≥ 10 chars); `returnToken: true` returns `{token}` and sets no cookie (native apps) |
| POST | `/auth/login` | — | `{email, password, returnToken?}` |
| POST | `/auth/logout` | signed in | ends this session |
| POST | `/auth/password` | signed in | `{currentPassword, newPassword}`; signs out other devices |
| POST | `/auth/password-reset/request` | — | `{email}`; always the same answer (no account enumeration); 3/hour per email |
| POST | `/auth/password-reset/confirm` | — | `{token, newPassword}`; one-time, 30-minute token; signs out all devices |
| POST | `/auth/verify-email/request` | signed in | re-send the confirmation link (5/hour) |
| POST | `/auth/verify-email/confirm` | — | `{token}` confirms the email |
| GET | `/ai/status` | signed in | `{available, provider, model, local, sharesNames}` (no secrets) |
| GET | `/me` | signed in | user (with `emailVerified`), `verification` policy, `ai` status, organizations with your role |
| GET/POST | `/me/two-factor` | signed in | Two-step login: status; `{action:'setup',password}` → `{secret, uri}`; `{action:'enable',code}` → `{recoveryCodes}`; `{action:'recovery-codes',password,code}`; `{action:'disable',password,code}` |
| POST | `/invitations/accept` | signed in | `{token, preview: true}` shows the invitation; `{token}` joins (needs a confirmed email unless verification is off). The token is never put in a URL. |
| GET/POST | `/orgs` | signed in | list / create (you become owner; chart of accounts is seeded) |
| GET | `/orgs/{org}` | viewer | includes `permissions` for your role |
| PATCH | `/orgs/{org}` | admin | business details, `aiEnabled`, `upiId` |
| DELETE | `/orgs/{org}` | owner | `{confirmName}` must equal the name |
| GET | `/orgs/{org}/members` | admin | members + pending invitations |
| PATCH/DELETE | `/orgs/{org}/members/{userId}` | admin (self-delete = leave, any role) | `{role}` |
| POST | `/orgs/{org}/invitations` | admin | `{email, role}` → `{link, token}` shown once |
| DELETE | `/orgs/{org}/invitations/{id}` | admin | revoke |
| GET/POST | `/orgs/{org}/groups` | viewer / accountant | `{name, parentId}` |
| GET/POST | `/orgs/{org}/ledgers` | viewer / cashier* | `?q=&group=sundry_debtors`; *cashiers: customers/suppliers only |
| GET/PATCH | `/orgs/{org}/ledgers/{id}` | viewer / accountant | |
| GET/POST | `/orgs/{org}/units` | viewer / accountant | |
| GET/POST | `/orgs/{org}/items` | viewer / accountant | GET includes live `stockQty` |
| PATCH | `/orgs/{org}/items/{id}` | accountant | |
| GET | `/orgs/{org}/vouchers` | viewer | `?type=&from=&to=&party=&limit=&offset=` |
| POST | `/orgs/{org}/vouchers` | cashier (sales, receipt) / accountant (others) | see below |
| GET | `/orgs/{org}/vouchers/{id}` | viewer | with entries and items |
| POST | `/orgs/{org}/vouchers/{id}/cancel` | accountant | `{reason}` |
| GET | `/orgs/{org}/reports/{name}` | viewer | `dashboard, trial-balance, profit-loss, balance-sheet, day-book, stock-summary, gst-summary, outstanding (?kind=receivable|payable), ledger (?ledger=)`; `?from=&to=` |
| GET | `/orgs/{org}/audit` | admin | `?before=&limit=` |
| GET | `/orgs/{org}/export` | admin | complete JSON backup of the business (download) |
| POST | `/orgs/{org}/import/{items|parties}` | accountant | `{rows:[{…}], dryRun, skipExisting}` — rows keyed by CSV header; dry run returns errors by row; real import is all-or-nothing; ≤ 5000 rows, ≤ 4 MB |
| GET | `/orgs/{org}/notifications` | viewer | your inbox: `?unread=1&limit=`; returns `{unread, notifications[]}` |
| POST | `/orgs/{org}/notifications/read` | viewer | `{ids:[…]}` or `{all:true}` |
| GET/PATCH | `/orgs/{org}/notification-settings` | viewer | `{notifyEmail}` — daily summary by email |
| GET | `/orgs/{org}/reminders/{ledgerId}` | cashier | `?language=en|hi|hinglish` → message, phone, WhatsApp/SMS links, last reminder |
| POST | `/orgs/{org}/reminders/{ledgerId}` | cashier | `{channel: whatsapp|sms|email|copy, language, message?}` records (or emails) a reminder; 3/customer/day |
| POST | `/orgs/{org}/ocr/invoice` | accountant | body = photo bytes, `Content-Type: image/jpeg` or `image/png`, ≤ 8 MB; returns a purchase draft. 60/hour per user |
| POST | `/orgs/{org}/ai/summary` | viewer | `{period: today|week|month|fy, language: en|hi|hinglish, question?}` → `{summary, provider, model, local, namesShared}`; business must have AI on; 30/hour |
| POST | `/orgs/{org}/ocr/parse` | accountant | `{text}` (≤ 50,000 chars) from on-device OCR; returns a purchase draft. 300/hour per user |
| GET | `/api/health` | — | liveness (database) |
| GET | `/api/ready` | — | readiness (database, migrations, Redis) |
| GET | `/api/metrics` | `Bearer METRICS_TOKEN` | Prometheus metrics (404 when disabled) |
| GET | `/me/sessions` | signed in | your signed-in devices; DELETE signs out all others |
| DELETE | `/me/sessions/{id}` | signed in | sign out one device |
| GET | `/me/security-events` | signed in | your sign-in and security history |
| GET | `/orgs/{org}/flags` | viewer | which optional features are on for this business |
| POST | `/orgs/{org}/images?kind=item|logo` | accountant (item) / admin (logo) | body = image bytes (`image/*`, ≤ 10 MB) → `{id, urls:{thumb, medium, large}}`; attach with `imageId` on an item or `logoImageId` on the business |
| GET | `/api/img/{key}?e=&s=` | signed URL | image variant (WebP), `public, immutable`, ETag/304 |

Every response carries `x-request-id`. Features switched off by a flag answer **404**.

### Creating vouchers

Item voucher (sales, purchase, credit_note, debit_note):
```json
{ "type": "sales", "date": "2026-11-01", "partyLedgerId": null,
  "placeOfSupply": "23", "reference": "", "narration": "", "roundOff": true,
  "items": [ { "stockItemId": "…", "qty": "2", "rate": "510", "discount": "0", "gstRate": "5" } ] }
```
`partyLedgerId: null` = cash bill. `gstRate` defaults to the item's rate. GST is only charged if the
organization has a GSTIN; intra-state → CGST+SGST, inter-state → IGST.

Accounting voucher (receipt, payment, contra, journal):
```json
{ "type": "receipt", "date": "2026-11-01",
  "entries": [ { "ledgerId": "<cash>", "debit": "500" }, { "ledgerId": "<customer>", "credit": "500" } ] }
```
**Correcting a voucher:** add `"replacesVoucherId": "<id>"` (same type, must be posted; needs the
`voucher.cancel` permission). The new voucher is posted and the original is cancelled with the reason
"Corrected: replaced by …" in one transaction.

**Stock adjustment:** `{"type": "stock_adjustment", "date", "narration": "reason (required)", "items": [{"stockItemId", "qty", "direction": "in"|"out", "rate"?}]}` —
no ledger lines; valued at cost (purchase price) unless `rate` is given. Accountant and above.

Debits must equal credits. Receipts must debit cash/bank; payments must credit cash/bank;
contra only between cash/bank ledgers.

### Purchase draft (OCR response)
```json
{ "supplierGstin": "23AAACR5055K1ZF", "supplierName": "ANNAPURNA WHOLESALE TRADERS",
  "supplier": { "ledgerId": "…", "name": "…" } | null,
  "invoiceNumber": "AW/2026/0457", "invoiceDate": "2026-11-03", "interState": false,
  "totals": { "taxable": 9805, "cgst": 245.13, "sgst": 245.12, "igst": null, "roundOff": -0.25, "total": 10295 },
  "items": [ { "description": "Basmati Rice 5kg", "hsn": "1006", "qty": 10, "rate": 420, "amount": 4200, "discount": 0, "gstRate": 5,
               "match": { "stockItemId": "…", "name": "…", "score": 0.83 } | null, "candidates": [ … ] } ],
  "warnings": [ "…" ], "confidence": 1, "ocr": { "engine": "server-tesseract", "confidence": 91 } }
```
Nothing is saved by these endpoints. Create the purchase with `POST /vouchers` after review.
