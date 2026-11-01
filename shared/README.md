# shared/

Pure JavaScript (no Node, React or Next.js imports) used by **both** the server/web app and the
Expo mobile app. Keep it that way: anything here must run in Node and in React Native (Hermes).

- `money.js` — integer paise/milli-unit parsing and formatting
- `gst.js` — GST line/invoice computation and state codes
- `permissions.js` — role → action matrix (UI hides what the server would refuse anyway)
- `states.js` — sorted state list for pickers
- `invoiceParser.js` — turns OCR text of a purchase invoice into a structured draft
- `gstin.js` — GSTIN format + checksum validation
