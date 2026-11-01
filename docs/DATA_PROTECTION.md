# Who can see your data, and how it is protected

## Who can see a business
**Only people who belong to it.** You become a member by creating the business (owner) or by accepting an
invitation sent to your email. Nobody else — including other users of the same server — can see that the
business exists, let alone its data.

This is enforced in three layers, so one mistake cannot expose data:
1. **Database row-level security.** Every row carries its business id; the database itself refuses to return
   or change rows of a business you are not working in. Tests run raw SQL as the app to prove it.
2. **Membership check on every request.** Not a member → "not found" (not even "forbidden").
3. **Role permissions inside a business.** A cashier cannot see the team or cancel bills; a viewer cannot
   change anything; only owners can delete the business. Tested for every role × every action.

Each person's **notifications** are private to them, even from other members.

## What is encrypted
| Data | Protection |
|---|---|
| All traffic between phone/browser and server | HTTPS (TLS) — set up by your hosting |
| Passwords | Never stored; only a scrypt hash (cannot be reversed) |
| Sign-in sessions, invitation/reset/confirmation links | Only a SHA-256 hash is stored |
| **Phone, email and address** of customers, suppliers and your business | **AES-256-GCM encryption** in the database with `DATA_ENCRYPTION_KEY`. A stolen database or backup shows only `enc:v1:…` |
| Photos for invoice scanning | Not stored at all |
| Amounts, item names, ledger names, voucher details | Protected by access control and the hosting provider's disk encryption — **not** field-encrypted, because the database has to add them up for reports in milliseconds |
| Backups | Use a managed Postgres with encrypted backups; your own JSON backup download is readable by you |

## Honest limits
- The **person who runs the server** (with the database password **and** the encryption key) can technically
  read everything, as with any online accounting service. Run it yourself, or choose a host you trust.
- Login emails are stored readable (needed to find your account at sign-in).
- If `DATA_ENCRYPTION_KEY` is lost, encrypted contact details cannot be recovered. Keep a copy offline.
- AI summaries: off by default; with a cloud AI provider, figures (not contact details) are sent to it.

## Settings that matter
- `DATA_ENCRYPTION_KEY` — required in production (see `.env.example`); `npm run db:encrypt-existing` after adding it.
- `APP_ORIGIN` — required in production (secure email links).
- HTTPS on your domain; `TRUST_PROXY=1` behind a proxy.
