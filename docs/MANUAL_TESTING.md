# Manual testing checklist

Automated tests cover the rules (`npm test`, `npm run smoke`, `cd mobile && npm test`). This list is
for things a person should check by hand. Tick them off and note anything odd at the bottom.

## Owner: please check / decide
These need your judgement; the code works either way.

- [ ] **Brand name and package id.** The app is called "My Shop" with Android package `in.lintlab.myshop`
      (`mobile/app.json`). Once published to the Play Store the package id can never change. Confirm it.
- [ ] **Server address for release builds.** Set `extra.apiUrl` in `mobile/app.json` to your real https domain.
- [ ] **Sign-up is open to everyone.** Anyone can create an account and a business. If you want an invite-only
      beta, say so (easy switch).
- [ ] **Sign-up tells people if an email already has an account.** Friendly, but lets someone test which
      emails are registered. Keep, or change to a neutral message?
- [ ] **OCR stays on our own servers** (no Google Cloud/OpenAI). Better privacy, lower accuracy on bad photos.
      If you want a paid cloud reader for hard invoices, that is a business decision (cost + data agreement).
- [ ] **Hosting.** Pick where to run it (any Node host + managed Postgres with backups). See README → Deploying.
- [ ] **Legal pages.** A public product needs Terms of Service and a Privacy Policy (not written by me).

## Website
1. Sign up, create a business with your real GSTIN. A wrong check digit must be refused.
2. Parties & ledgers → set the **Capital** opening balance (Credit) so the balance sheet has no
   "Difference in opening balances".
3. Stock → add 3 items with opening stock. Check the stock numbers.
4. New sale (cash) → check CGST/SGST split and round-off → Print / PDF looks right on paper/A4.
5. New sale to a customer from another state → IGST only.
6. Receipt from that customer → Reports → Receivables drops by that amount.
7. Payment for rent → Profit & Loss shows Rent under indirect expenses.
8. Open a sale → **Correct…** → change a quantity → save → the old bill shows Cancelled ("replaced by …"),
   stock and reports reflect only the new one.
9. Cancel a voucher with a reason → it disappears from reports, still visible (struck out) in the list.
10. **Scan invoice:** New purchase → Scan invoice → photograph a real supplier bill.
   Check supplier, invoice no., date, items, totals; create the supplier; save; compare with the paper bill.
11. Team → invite a second email as **Cashier** → open the link in another browser → sign up with that
    email → confirm the cashier cannot see Purchase, cannot cancel, cannot see Team.
12. Try opening the first business's URL while signed in as a user who is not a member → "not found".
13. Forgot password → with no email provider configured the link appears in the server log (dev);
    in production set RESEND_API_KEY/EMAIL_FROM.
14. Reports → Download CSV → opens in Excel/Sheets with ₹ and names correct; a customer named
    `=1+1` shows as text, not 2.
15. On a phone browser: menu → Add to Home screen → opens full screen with the ₹ icon.
16. Phone browser: everything usable, bottom tab bar, no sideways scrolling, dark mode readable.

## Email and AI (on your PC)
1. `docker compose up -d` (starts Mailpit). In `.env.local`: `EMAIL_PROVIDER=smtp`, `SMTP_HOST=localhost`, `SMTP_PORT=1025`.
2. Sign up a new account → open http://localhost:8025 → click "Confirm email" → you can now create a business.
3. Invite someone → the invitation appears in Mailpit. Forgot password → reset email appears in Mailpit.
4. Ollama: `ollama pull llama3.2`, set `AI_PROVIDER=ollama`, `AI_MODEL=llama3.2`, restart → Settings → turn on AI →
   Home → ✨ Shop summary in English, then Hindi, then ask a question. Check the numbers against Reports.
5. Try LM Studio and Groq the same way (see docs/AI.md). With Groq, confirm the note says names were not shared.
6. Stop Ollama and press Summarise → a clear "Could not reach the AI server" message.

## Import, stock count, multiple firms
1. Stock → Import CSV → Download template → fill 10 items in Excel → save as CSV → choose file → preview →
   fix any rows it reports → Import. Repeat for customers & suppliers.
2. Stock → Count stock → enter real counted quantities for a few items → Save → stock and P&L (closing stock)
   change accordingly; the adjustment appears in Vouchers as ADJ/…
3. With one business: sign out and in → you land directly in it.
4. Create a second business → "Your businesses" shows both with today's/month's sales and totals; the books,
   numbering and items of the two are completely separate.

## Notifications and reminders
1. As owner, invite a cashier; when they join, 🔔 shows "… joined as cashier".
2. As the cashier, make a sale that takes an item to its reorder level → accountants/owner see "Low stock".
3. As an accountant, cancel a bill → owner and admins see "… cancelled by …" with the reason.
4. Settings → Notifications → email me the daily summary; run `npm run notify:daily` the next day (or after
   entering a voucher dated yesterday) → notification + email (Mailpit).
5. Settings → UPI ID. Reports → Receivables → Remind → Hindi → WhatsApp opens with the customer's number
   and text; "Last reminded … by whatsapp" appears. Try the 4th reminder the same day → refused.
6. Phone: More shows a badge with the unread count; customer ledger → Send payment reminder → WhatsApp.

## Android app
1. Build: `cd mobile && npx expo run:android` (or EAS preview APK). Set Server to your PC's address.
2. Sign in with the website account → pick the business → Home numbers match the website.
3. Sell → cash bill with 2 items → total matches what the website shows for the same items → Share PDF
   to WhatsApp → the PDF opens and looks right.
4. Open that bill → **Correct this bill** → change quantity → save → the original shows cancelled.
5. Stock → + New item → appears in the list and in Sell.
6. Receive money / Pay expense → appear in Vouchers and on the website.
7. Scan purchase invoice → **Read on phone** (development build) and **Read on server** → both give a
   sensible draft → save → compare with the paper bill.
8. Turn on airplane mode → actions show a clear "could not reach the server" message, no crash.
9. Sign out → reopen app → asks to sign in. Sign in as the cashier → no purchase/scan options.
10. Rotate/large font sizes (Android accessibility settings) → text still fits.

## Security checks (round 2 fixes, on a real browser/phone)
- [ ] Open `/login?next=/%09/example.com`, sign in: you must land on your businesses, **not** example.com.
- [ ] With email set up: invite a new address, sign up with it **without** clicking the confirmation link,
      open the invitation: it must ask you to confirm your email first.
- [ ] Without email set up: creating an invitation shows the "send it only to that person" note.
- [ ] As a cashier: a receipt with an extra expense line, a sales bill with a changed GST %, and a new customer
      with an opening balance are all refused with a clear message.
- [ ] After bills exist, Settings refuses to change the financial-year start month.
- [ ] Behind your real proxy: set `TRUST_PROXY=1` (and `TRUSTED_PROXY_HOPS` if there are two proxies). Check
      "Where am I signed in?" shows your real IP, not the proxy's.
- [ ] An item photo older than a day is still shown after `npm run db:cleanup` (F-22).

## Notes / problems found
(write here)
