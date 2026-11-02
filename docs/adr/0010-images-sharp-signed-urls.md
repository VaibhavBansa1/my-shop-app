# ADR-0010: Images processed with sharp, stored in S3-compatible storage, served by signed cacheable URLs

**Status:** Accepted
**Date:** 2026-11-02
**Deciders:** Vaibhav Bansal (owner)

## Context
Item photos and business logos need to load fast on cheap phones and not load the server. They belong to a
business, so they must not be public.

## Decision
- **sharp** (libvips; Node's fastest image library, the counterpart of Python's Pillow): validate, guard
  against decompression bombs, auto-rotate, strip all metadata (GPS!), make WebP variants (160/640/1280).
- Browsers and phones shrink photos before upload (≤ 1600 px).
- Storage: local disk or any S3-compatible service; content-addressed keys (`<sha256>-<kind>-<variant>.webp`).
- Delivery: HMAC-signed URLs whose expiry is rounded to the day, served with
  `Cache-Control: public, immutable` and ETag. A CDN (Cloudflare, CloudFront…) in front caches them, so after
  the first view the server is not touched. `IMAGE_BASE_URL` points image links at the CDN host.
- Phone app: `expo-image` with memory + disk cache.

## Options Considered
| Option | Pros | Cons |
|---|---|---|
| **Pre-made variants + signed URLs + CDN (chosen)** | Fast, cheap, private, cache-friendly | Fixed sizes |
| Next.js `next/image` optimizer | Automatic sizes | Resizes on the app server (CPU), harder with private images |
| Public bucket URLs | Simplest | Anyone with the URL forever; no revocation by expiry |
| Image CDN service (imgix, Cloudinary) | On-the-fly sizes | Extra paid service, data leaves our storage |

## Consequences
- A leaked image URL works until its expiry (≤ 8 days) — acceptable for product photos and logos.
- Unused uploads are deleted by the daily cleanup after a day.
