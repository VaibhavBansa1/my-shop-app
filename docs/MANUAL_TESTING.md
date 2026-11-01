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
8. Cancel a voucher with a reason → it disappears from reports, still visible (struck out) in the list.
9. **Scan invoice:** New purchase → Scan invoice → photograph a real supplier bill.
   Check supplier, invoice no., date, items, totals; create the supplier; save; compare with the paper bill.
10. Team → invite a second email as **Cashier** → open the link in another browser → sign up with that
    email → confirm the cashier cannot see Purchase, cannot cancel, cannot see Team.
11. Try opening the first business's URL while signed in as a user who is not a member → "not found".
12. Phone browser: everything usable, bottom tab bar, no sideways scrolling, dark mode readable.

## Android app
1. Build: `cd mobile && npx expo run:android` (or EAS preview APK). Set Server to your PC's address.
2. Sign in with the website account → pick the business → Home numbers match the website.
3. Sell → cash bill with 2 items → total matches what the website shows for the same items → Share PDF
   to WhatsApp → the PDF opens and looks right.
4. Receive money / Pay expense → appear in Vouchers and on the website.
5. Scan purchase invoice → **Read on phone** (development build) and **Read on server** → both give a
   sensible draft → save → compare with the paper bill.
6. Turn on airplane mode → actions show a clear "could not reach the server" message, no crash.
7. Sign out → reopen app → asks to sign in. Sign in as the cashier → no purchase/scan options.
8. Rotate/large font sizes (Android accessibility settings) → text still fits.

## Notes / problems found
(write here)
