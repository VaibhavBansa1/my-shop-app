# Glossary — every title and keyword, explained

This app follows the way Indian shops and their accountants already work (the Tally way). This page
explains each word you see, why it is there, and an example. The same text is shown inside the app at
**Help** (`/help`).

---

## Accounts and books

**Organization / Business** — One set of books: one shop or company. A person can own or work in many
businesses; each one is completely separate (its own customers, stock, numbers and reports).

**Books begin from** — The first date you keep accounts in this app. Opening balances and opening stock
are "as on" this date. You cannot enter vouchers before it.

**Financial year (FY)** — The 12-month accounting year. In India it runs **April to March**
(FY 2026-27 = 1 Apr 2026 to 31 Mar 2027). Voucher numbers restart every financial year.

**Ledger** — One account you track money in: a customer (Ramesh Traders), a supplier, Cash, a bank
account, Sales, Rent, Output CGST… Every amount in the books belongs to some ledger.

**Group** — A folder of ledgers of the same kind. Customers sit under **Sundry Debtors**, suppliers under
**Sundry Creditors**, cash under **Cash-in-Hand**. Reports add ledgers up group by group. The app creates
the standard Tally groups for you; you rarely need new ones.

**Sundry Debtors** — People who owe you money (customers you sell to on credit). "Sundry" = various.

**Sundry Creditors** — People you owe money to (suppliers who gave you goods on credit).

**Cash-in-Hand / Bank Accounts** — Where your money actually is. Receipts and payments must use one of these.

**Capital** — The owner's own money put into the business. Its opening balance usually balances your books.

**Duties & Taxes** — Group for tax ledgers: Output CGST/SGST/IGST (tax you collected and owe the government)
and Input CGST/SGST/IGST (tax you paid on purchases and can claim back).

**Direct / Indirect expenses and incomes** — *Direct* ones relate to buying and selling goods (they affect
gross profit). *Indirect* ones are running costs like rent, salary, electricity (they affect net profit).

**Opening balance** — What a ledger stood at on the "books begin" date. **Dr (debit)** for things you
own or are owed (cash, bank, customers who owe you). **Cr (credit)** for what you owe (suppliers, loans) and
for capital.

**Debit (Dr) / Credit (Cr)** — The two sides of every entry. Every voucher has equal debits and credits —
that is why the books always balance. In this app: money coming *into* cash/bank is a debit to cash/bank;
a sale is a credit to Sales; a customer buying on credit is a debit to that customer.

**Double entry** — Every transaction touches at least two ledgers (e.g. a cash sale: Cash Dr, Sales Cr).

**Round off** — Bills are rounded to the nearest rupee; the paise difference is posted to the Round Off
ledger so the books still balance.

---

## Vouchers (transactions)

**Voucher** — One transaction, with a number like `INV/26-27/15`. Types:

| Type | Use it when | Example |
|---|---|---|
| **Sales** | You sell goods | Bill for 2 bags of rice |
| **Purchase** | You buy goods for resale | Supplier's bill for 50 bags |
| **Receipt** | Money comes in (not a sale bill) | Customer pays ₹5,000 they owed |
| **Payment** | Money goes out | Rent, salary, paying a supplier |
| **Contra** | Money moves between your own cash/bank | Depositing cash in the bank |
| **Journal** | Adjustments with no cash/bank | Writing off a bad debt |
| **Credit Note** | A customer returns goods you sold | Sales return |
| **Debit Note** | You return goods to a supplier | Purchase return |

**Voucher number** — Automatic, gap-free, per type per financial year (`INV` sales, `PUR` purchase,
`RCT` receipt, `PAY` payment, `CON` contra, `JRN` journal, `CN` credit note, `DN` debit note).

**Party** — The customer or supplier on a voucher. Leave it as **Cash** for walk-in cash bills.

**Reference / bill no.** — Your note of an outside number, most importantly the **supplier's invoice
number** on purchases (used to catch the same bill being entered twice).

**Narration** — A short note about the transaction ("Diwali stock", "paid by UPI").

**Cancel (with reason)** — Posted vouchers are never edited or deleted (like Tally's audit mode). A wrong
voucher is cancelled — it stays visible, struck out, with the reason — and no longer counts anywhere.

**Correct…** — Shortcut: opens a copy to fix; saving creates the corrected voucher and cancels the
original in one step.

---

## GST (India)

**GST** — Goods and Services Tax, charged on most sales in India.

**GSTIN** — Your 15-character GST number, e.g. `23ABCDE1234F1Z8`. First 2 digits = state code, next 10 =
PAN, last character = a check digit (the app verifies it, so typing mistakes are caught).

**State code** — 2-digit GST code of a state (23 = Madhya Pradesh, 07 = Delhi, 27 = Maharashtra).

**Place of supply** — The state where the goods are delivered. It decides which tax applies.

**CGST + SGST** — Same-state sale: tax is split half to the Central government (CGST) and half to the State
(SGST). 18% GST = 9% CGST + 9% SGST.

**IGST** — Different-state sale: the whole tax is "Integrated GST" to the Centre.

**GST rate** — Percentage for an item (common: 0, 5, 18, 40; older/special: 3, 12, 28, 0.25).

**HSN / SAC code** — Government code for the kind of goods (HSN) or service (SAC). Rice is 1006. Needed on
tax invoices: 4 digits for most small businesses (turnover up to ₹5 crore), 6 digits above that.

**Taxable value** — Price × quantity − discount, before GST.

**Output tax** — GST you collected on sales (you owe it). **Input tax credit (ITC)** — GST you paid on
purchases (you can subtract it). **Net GST payable** = output − input.

**Tax Invoice** — The bill title used when a GST-registered business sells. Unregistered businesses
print "Sales" instead and charge no GST.

**GSTR-1 / GSTR-3B** — Monthly GST returns. The **GST Summary** report gives the totals to help fill them;
your accountant files them.

---

## Stock

**Stock item** — A product you buy and sell. **SKU / code** — your own short code for it (optional).

**Unit** — How you count it: pcs, kg, litre, box… The unit decides how many decimals a quantity may have
(pcs = whole numbers, kg = up to 3 decimals).

**Opening stock / opening rate** — Quantity on hand and its cost per unit on the "books begin" date.

**Reorder level** — When stock falls to this number, the item is shown as **Low stock**.

**Stock on hand** — Never typed in: always calculated from opening stock plus purchases and returns minus
sales. That is why it can never "drift".

**Average cost / stock value** — Stock is valued at the weighted average purchase cost. Closing stock
value appears in Profit & Loss and the Balance Sheet.

---

## Reports

**Dashboard** — Today's and this month's sales, cash & bank, stock value, low stock.

**Day Book** — Every voucher of a day (or period), in order.

**Ledger statement** — Every entry in one ledger with a running balance (e.g. a customer's account).

**Trial Balance** — All ledger balances; total debits must equal total credits. A "difference in opening"
means opening balances were not entered fully.

**Profit & Loss (P&L)** — Income minus expenses for a period. **Gross profit** = sales − cost of goods
sold (opening stock + purchases − closing stock). **Net profit** = gross profit − running expenses.

**Balance Sheet** — What the business owns (assets) and owes (liabilities + capital + profit) on a date.
Both sides must be equal.

**Receivables / Outstanding** — Customers who owe you. **Payables** — what you owe suppliers.

**Stock Summary** — Quantity, average cost and value of every item.

**GST Summary** — Taxable value and tax by rate, for sales and purchases, and the net payable.

---

## People and security

**Roles** — **Owner** (everything, including deleting the business), **Admin** (everything except deleting;
manages the team), **Accountant** (all vouchers, masters, cancelling), **Cashier** (sales bills, receipts,
new customers), **Viewer** (read-only).

**Invitation** — A one-time link for a specific email address and role, valid 7 days.

**Activity log** — Who did what and when (create, cancel, role change…). Cannot be edited.

**Email confirmation** — New accounts confirm their email before creating or joining a business (when the
server has email set up).

---

## Scanning and AI

**Scan invoice (OCR)** — Take a photo of a supplier's bill; the app reads the text (OCR = optical character
recognition) and pre-fills a purchase for you to check. The photo is not stored.

**Read on phone / on server** — Where the reading happens. On the phone, only the text is uploaded.

**Confidence** — How sure the reader was. Always check the numbers before saving.

**Shop summary (AI)** — Optional. A language model turns your report figures into a few plain sentences in
English, Hindi or Hinglish. It can run on your own computer (Ollama, LM Studio) or a cloud service (Groq,
OpenRouter…). It never changes your books.
