# Browser end-to-end checks

Plain Playwright scripts that click through the real website (start the app first).

```bash
npm install --no-save playwright && npx playwright install chromium
```

| Script | What it checks |
|---|---|
| `ui-walk.cjs` | sign-up → business → items → customer → sales (GST/IGST) → receipt → reports → team invite; phone + dark mode, no sideways scroll; refreshes `docs/screenshots` |
| `scan-walk.cjs` | scan the sample invoice → create supplier → fill purchase → saved total ₹10,295 |
| `correct-walk.cjs` | correct a bill: original cancelled, replacement posted |
| `csv-walk.cjs` | CSV download from reports |
| `ai-walk.cjs` | needs `EMAIL_PROVIDER=log`, `EMAIL_VERIFICATION=required`, AI configured, and the server log path in `SERVER_LOG`: verification gate, emailed link, AI summary, invitation email |

```bash
node e2e/ui-walk.cjs
```
Set `BASE=http://192.168.1.20:3000` to test another address.
