# ADR-0006: Expo (React Native) app in `mobile/`, sharing pure code via `shared/`

**Status:** Accepted
**Date:** 2026-11-01
**Deciders:** Vaibhav Bansal (owner)

## Context
The owner wants an Android app. The website is Next.js (React for the DOM). React Native cannot
render Next.js pages, but it can use the same REST API and the same plain-JavaScript logic.

## Decision
- A separate Expo SDK 58 project in `mobile/` (Expo Router, JavaScript like the web app).
- It talks only to `/api/v1` with a bearer token stored in `expo-secure-store`.
- Pure modules live in `shared/` (money, GST, GSTIN, states, invoice parser, permissions). The server
  imports them through `lib/*` re-exports; Metro bundles them via `watchFolders` in `mobile/metro.config.js`.
- No npm workspaces: the root stays a normal Next.js app so nothing about the web deploy changes.

## Options Considered
| Option | Pros | Cons |
|---|---|---|
| **Expo app + shared/ (chosen)** | Native UI, camera, secure storage, on-device OCR; same API; exact same GST maths | Second UI to maintain |
| Wrap the website (PWA / TWA) | Fastest; one UI | No on-device OCR, weaker camera and offline story, feels like a web page |
| Kotlin native app | Best Android fit | New language, no code sharing, slower to build |
| npm/Expo monorepo with workspaces | Auto Metro config | Restructures the web project and its deploy |

## Consequences
- Easier: one backend, one set of business rules; UI previews match server totals to the paisa.
- Harder: `shared/` must stay free of Node/React/DOM APIs (it runs in Hermes too).
- Revisit: move to workspaces if a second app or shared UI package appears; TypeScript for both.
