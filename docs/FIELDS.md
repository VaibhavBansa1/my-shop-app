# Field reference — what each field is, required or optional, and why

Rule of thumb used for every decision: **ask only for what the law or the arithmetic needs; make everything
else optional with a safe default.** A shopkeeper should be able to start billing in two minutes and add
detail later. Things that would silently corrupt the books are *refused*, not warned.

Legend: **Req** = required · Opt = optional · *(server)* = enforced by the API/database, not just the form.

---

## Account (sign up)

| Field | Req? | Limits | Why |
|---|---|---|---|
| Your name | **Req** | 1–120 chars, no line breaks | Shown in the activity log ("entered by") and emails. |
| Email | **Req** | valid email, ≤254, stored lower-case | Sign-in identity; invitations and password reset go here. |
| Password | **Req** | 10–200 chars | Length beats complexity rules; a short sentence is ideal. Stored only as a scrypt hash. |

Email confirmation: required before creating/joining a business **when the server has email set up**
(`EMAIL_VERIFICATION`). Why: stops people signing up with someone else's address and receiving invitations meant for them.

---

## Business (organization)

| Field | Req? | Default | Why |
|---|---|---|---|
| Business name | **Req** | — | Shown everywhere and on invoices (unless a legal name is set). |
| Legal name | Opt | business name | Printed on invoices when the registered name differs ("Bansal Traders" vs "Bansal General Store"). |
| GSTIN | Opt | none | Only GST-registered businesses have one. **If empty, no GST is charged** on sales — correct for unregistered/composition-exempt shops. Check digit verified *(server)*. |
| State | Opt* | from GSTIN | Needed to decide CGST+SGST vs IGST. *Filled automatically from the GSTIN; must match it *(server)*. |
| Address, phone, email | Opt | empty | Printed on invoices when present. Not needed for the books. |
| Financial year starts | Opt | April | Indian FY is April–March; other countries can change it. Voucher numbers restart each FY. |
| Books begin from | Opt | today | Date of opening balances. Cannot move after the first voucher *(server)*, because that would silently change opening figures. |
| AI summaries | Opt | **off** | Privacy: a business opts in explicitly (owner/admin). |
| Country / currency | Opt | IN / INR | Kept for future use; the app is built for Indian GST today. |

---

## Ledger (customer, supplier, bank, expense…)

| Field | Req? | Default | Why |
|---|---|---|---|
| Name | **Req** | — | Must be unique in the business (avoids posting to the wrong "Ramesh"). |
| Under group | **Req** | — | Decides where it appears in reports (customer vs supplier vs expense). Cashiers can only choose customers/suppliers. |
| Opening balance + Dr/Cr | Opt | 0 | Only for balances that existed before "books begin". |
| GSTIN | Opt | none | Needed for B2B invoices and for the scanner to recognise a supplier automatically. Check digit verified. |
| State | Opt | from GSTIN | Lets the app pick IGST for out-of-state customers automatically. Must match the GSTIN. |
| Phone, email, address | Opt | empty | Contact details; printed nowhere else. Not sent to AI. |
| Active | Opt | yes | Inactive ledgers can't be used in new vouchers but keep their history. Built-in ledgers (Cash, Sales, GST…) can't be deactivated, renamed or moved *(server)*. |

Ledgers are never deleted (only deactivated), because past vouchers point to them.

---

## Stock item

| Field | Req? | Default | Why |
|---|---|---|---|
| Name | **Req** | — | Unique in the business. |
| Unit | **Req** | pcs | Decides allowed decimals in quantity (pcs 0, kg/l 3, m 2) *(server)*. |
| SKU / code | Opt | empty | Your own short code / barcode text; unique when set. |
| HSN / SAC | Opt | empty | Required **on tax invoices** by GST rules (4 digits ≤ ₹5 cr turnover, 6 above). Kept optional so unregistered shops and quick starts aren't blocked; the invoice shows it when present. |
| GST % | Opt | 0 | 0 is valid (exempt goods, unregistered shops). Any value 0–100 is accepted because rates change (e.g. the 2025 GST revision); can be overridden per bill line. |
| Sale price | Opt | 0 | Pre-fills the sale bill; can be changed per bill. Before GST. |
| Purchase price | Opt | 0 | Pre-fills purchases; used as cost when no purchase has happened yet. |
| Reorder level | Opt | 0 | When stock ≤ this, it shows as **Low stock**. |
| Opening qty | Opt | 0 | Stock on hand on "books begin". May be negative only through sales, never typed. |
| Opening rate | Opt | purchase price | Cost per unit of opening stock. **If left empty with opening qty, the purchase price is used** — otherwise the stock would be valued at ₹0 and profit would look wrong. |

---

## Voucher (any type)

| Field | Req? | Default | Why |
|---|---|---|---|
| Type | **Req** | Sales | Decides posting rules and numbering. Cashiers may create only Sales and Receipts. |
| Date | **Req** | today | Not before "books begin"; **not more than 31 days ahead** *(server)* — post-dated bills are allowed, but a wrong year is caught. |
| Party (customer/supplier) | Opt | **Cash** | Walk-in cash sales need no customer. For credit sales choose the customer so "who owes me" is correct. |
| Place of supply | Opt | party's state, else your state | Decides CGST+SGST vs IGST. Override only for deliveries to another state. |
| Reference / bill no. | Opt | empty | For purchases this is the **supplier's invoice number**: the same number from the same supplier can't be entered twice *(server)* — catches double entry, especially after scanning. Sales are numbered automatically, so it's optional there. |
| Narration | Opt | empty | Free note. Never sent to AI. |
| Round off | Opt | on | Rounds the bill to the nearest rupee, posting the paise to "Round Off". |

**Item lines** (Sales, Purchase, Credit/Debit Note): item **Req**, quantity **Req** (> 0, decimals per unit),
rate **Req** (≥ 0), discount Opt (₹, can't exceed the line), GST % Opt (item's rate). At least one line;
total must be > 0.

**Ledger lines** (Receipt, Payment, Contra, Journal): at least two lines; each needs a ledger and either a
debit or a credit (> 0); **debits must equal credits**. Receipts must put money into cash/bank, payments
must take it out of cash/bank, contra only between cash/bank — enforced so reports stay meaningful.

**Cancel:** reason **Req** (kept forever for the audit trail). **Correct:** same type only; the original is
cancelled with "replaced by …" in the same step.

---

## Team

| Field | Req? | Why |
|---|---|---|
| Invite email | **Req** | The invitation only works for this email (stops forwarded links being used by someone else). |
| Role | **Req** | Admin, Accountant, Cashier or Viewer. Owner can't be invited directly — promote an existing member (prevents takeover by invitation). |

Rules: only owners manage owners/admins; the last owner can't leave or be demoted.

---

## Scanning and AI

| Field | Req? | Why |
|---|---|---|
| Photo | **Req** | JPEG/PNG ≤ 8 MB; automatically shrunk on the phone/browser. |
| Each scanned line: item choice | **Req** | Map to an existing item, create a new one, or skip — nothing is guessed silently. |
| AI period | Opt (this month) | Today, 7 days, month, financial year. |
| AI language | Opt (English) | English, Hindi, Hinglish. |
| AI question | Opt | ≤ 500 chars. Without it you get a summary. |
