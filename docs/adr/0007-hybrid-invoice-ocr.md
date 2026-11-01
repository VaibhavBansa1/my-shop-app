# ADR-0007: Hybrid invoice OCR — on-device first, server fallback, one shared parser

**Status:** Accepted
**Date:** 2026-11-01
**Deciders:** Vaibhav Bansal (owner)

## Context
Shops receive paper GST invoices from suppliers. Typing them in is slow and error-prone. The owner
asked for automatic digitization on the phone, and to try it online as well.

## Decision
1. **On the phone:** Google ML Kit text recognition (`expo-text-extractor`, needs a development or
   release build). Only the recognised *text* goes to `POST /ocr/parse`.
2. **Online / fallback:** the photo (downscaled to ≤ 2000 px JPEG) goes to `POST /ocr/invoice`, where
   Tesseract (bundled English data, no external service) reads it with page-segmentation mode 4.
3. **One parser** (`shared/invoiceParser.js`) turns text into a draft: supplier GSTIN (checksum-validated
   and OCR-repaired), supplier name guess, invoice number and date, taxable/CGST/SGST/IGST/round-off/total,
   and item lines where qty × rate ≈ amount. It cross-checks totals and returns warnings.
4. The server matches the supplier by GSTIN and items by name tokens + HSN, **under RLS**.
5. Nothing is saved automatically. The user reviews, creates missing supplier/items, and saves a normal
   purchase voucher (same validation and audit as any purchase).

## Options Considered
| Option | Pros | Cons |
|---|---|---|
| **Hybrid ML Kit + Tesseract (chosen)** | Works offline on phone; privacy (text only); free; web works too | Tesseract is weaker on poor photos |
| Cloud vision/LLM API (Google Vision, Textract, Claude) | Best accuracy, can read tables/handwriting | Per-page cost, sends invoices to a third party, needs keys and a DPA |
| Phone only | Simplest | No web scanning; Expo Go cannot use it |

## Consequences
- Photos are never stored; OCR is rate-limited per user (60 images/hour, 300 texts/hour).
- Accuracy depends on photo quality; the review step is mandatory by design.
- Revisit: add an optional cloud/LLM extractor behind the same `draftFromText` contract for
  low-confidence scans (with the owner's explicit consent and a data-processing agreement).
