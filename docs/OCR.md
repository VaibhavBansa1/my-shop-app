# Invoice scanning (OCR)

See [ADR-0007](adr/0007-hybrid-invoice-ocr.md) for the decision.

## Flow
```
 phone camera / web upload
        │
        ├─ phone with ML Kit ──► text ──► POST /orgs/{org}/ocr/parse   {text}
        │
        └─ otherwise ──► JPEG ≤2000px ──► POST /orgs/{org}/ocr/invoice  (image/jpeg|png body)
                                              │ checks: type sniff, ≤8 MB, ≤40 MP, ≥200 px
                                              │ Tesseract (PSM 4, offline eng data), 45 s timeout
                                              ▼
                         shared/invoiceParser.js  →  draft + warnings
                                              │
                         match supplier (GSTIN) and items (name + HSN) under RLS
                                              ▼
                     user reviews → create supplier/items → save purchase voucher
```

## What the parser extracts
Supplier GSTIN (checksum-validated, repairs O/0, S/5, I/1, Z/2/7 confusions), a supplier-name guess,
invoice number, date (day-first; numeric and month-name formats), taxable value, CGST, SGST/UTGST, IGST,
round-off, grand total, and item lines (description, HSN, qty, rate, amount, discount, GST %).

Warnings: total ≠ taxable + tax; item lines ≠ taxable; CGST ≠ SGST; missing GSTIN/date/items; your own
GSTIN not on the invoice.

## Limits
- Printed invoices work well; handwriting and very skewed or dark photos do not.
- Multi-page invoices: scan each page as a separate purchase or enter manually.
- English only (Hindi text is ignored; numbers and GSTINs still read).

## Configuration
- `OCR_LANG_PATH` — folder with `eng.traineddata.gz` (default: `node_modules/@tesseract.js-data/eng/4.0.0_best_int`).
- One OCR job runs at a time per server process (CPU-bound); scale by adding processes.
