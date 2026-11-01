# Android app (Expo)

Folder: `mobile/`. Expo SDK 58, React Native 0.88, Expo Router. Talks to the same server as the website.

## What it does
- Sign in / create account, choose or create a business (all businesses you belong to).
- **Home:** today's and this month's sales, cash & bank, stock value, low stock.
- **Sell:** pick customer (or cash), add items, live GST total computed with the *same* code as the
  server (`shared/gst.js`), save, then share the bill as a PDF (WhatsApp, email, print).
- **Vouchers:** list and filter, open any voucher, share PDF, cancel with a reason (accountants+).
- **Stock:** search, low-stock filter.
- **More:** receive money, pay/expense, scan purchase invoice, customers & suppliers (with ledger
  statements and balances), reports (P&L, receivables, payables, GST, stock), switch business,
  server address, sign out.
- Team management, settings, full masters and the balance sheet stay on the website.

## Run it on your phone (development)
On-device OCR is a native module, so it needs a **development build** (Expo Go works for everything
except on-phone OCR; scanning then falls back to the server automatically).

1. Install Node 20+, Android Studio (SDK + an emulator, or a phone with USB debugging).
2. Start the web server on your PC (see the root README) and note your PC's Wi-Fi IP, e.g. `192.168.1.20`.
   Start it with `npm run dev -- -H 0.0.0.0` so the phone can reach it. (`APP_ORIGIN` does not matter for the app: it uses bearer tokens.)
3. In `mobile/`:

```bash
npm install
```

```bash
npx expo run:android
```

4. In the app, tap **Server** on the sign-in screen and enter `http://192.168.1.20:3000`.

## Build an installable APK
Using EAS (Expo's build service; free tier is enough):

```bash
npx eas-cli@latest build --profile preview --platform android
```

For Play Store: `--profile production` makes an `.aab`. Before that, set `extra.apiUrl` in
`mobile/app.json` to your real https server address and bump `android.versionCode`.

Or locally with Android Studio: `npx expo prebuild --platform android`, then open `mobile/android`.

## Security notes
- Token in SecureStore (Android Keystore), `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; never cookies (`credentials: 'omit'`).
- Server address must be `https://`; `http://` only for private LAN addresses during testing.
  Release builds block cleartext HTTP by default on Android anyway.
- `allowBackup: false` so app data is not copied to cloud backups; microphone and storage permissions blocked.
- Printed/shared invoices are generated from escaped HTML with a deny-all CSP.
- A 401 from the server clears the token and returns to sign-in.

## Tests and checks
```bash
cd mobile && npm test
```
```bash
cd mobile && npx expo-doctor
```
```bash
cd mobile && npx expo export --platform android
```
The root `npm run smoke` also replays the app's API calls (bearer sign-up, sale, expense, both OCR paths).

## Known limits
- `npm audit` in `mobile/` reports moderate issues in Expo's **build tooling** (minimatch via the CLI),
  not in code shipped inside the app. Re-check after Expo patch releases.
- No offline mode yet (planned: queue sales offline; vouchers are append-only which keeps sync simple).
- Dates are typed as YYYY-MM-DD in two screens; a date picker is a planned polish item.
