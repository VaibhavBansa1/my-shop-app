# REST API v1

Base path `/api/v1`. JSON in and out. The web app and future native apps use the same API.

## Authentication
- **Web:** `POST /auth/login` sets an `HttpOnly` cookie `sid`. Requests that change data must come
  from the app's own origin (`Origin` header checked).
- **Native:** `POST /auth/login` with `"returnToken": true` returns `{ token }`; send
  `Authorization: Bearer <token>` on every request. No Origin needed.

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
| GET/POST | `/invitations/accept` | signed in | GET `?token=` preview; POST `{token}` join |
| GET/POST | `/orgs` | signed in | list / create (you become owner; chart of accounts is seeded) |
| GET | `/orgs/{org}` | viewer | includes `permissions` for your role |
| PATCH | `/orgs/{org}` | admin | business details, `aiEnabled` |
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
| POST | `/orgs/{org}/ocr/invoice` | accountant | body = photo bytes, `Content-Type: image/jpeg` or `image/png`, ≤ 8 MB; returns a purchase draft. 60/hour per user |
| POST | `/orgs/{org}/ai/summary` | viewer | `{period: today|week|month|fy, language: en|hi|hinglish, question?}` → `{summary, provider, model, local, namesShared}`; business must have AI on; 30/hour |
| POST | `/orgs/{org}/ocr/parse` | accountant | `{text}` (≤ 50,000 chars) from on-device OCR; returns a purchase draft. 300/hour per user |
| GET | `/api/health` | — | DB health check |

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
