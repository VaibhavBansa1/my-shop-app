# ADR-0004: Next.js modular monolith exposing a versioned REST API

**Status:** Accepted
**Date:** 2026-11-01
**Deciders:** Vaibhav Bansal (owner)

## Context
The web app comes first; an Android/iOS app comes later. One developer maintains it.
The repo already uses Next.js and `pg`.

## Decision
Keep a single Next.js (App Router) application. Business logic lives in plain modules
under `lib/services` with no React or HTTP imports. HTTP handlers under
`app/api/v1/**` are thin: parse, authorize, call a service, map errors. The web UI is
a client of that same REST API, so the native app needs nothing new on the server.

## Options Considered

### Option A: Next.js monolith + REST (chosen)
| Complexity | Low | Cost | One deployable | Scalability | Horizontal, stateless | Familiarity | High |

### Option B: Separate API service (Express/Fastify) + Next.js frontend
| Complexity | Medium | Cost | Two deployables | Scalability | Independent scaling | Familiarity | High |

### Option C: Next.js server actions only
| Complexity | Low | Cost | One deployable | Scalability | Good | Familiarity | Medium |

**C cons:** server actions are not a stable public API, so a native app could not use them.

## Trade-off Analysis
A keeps one thing to deploy while still giving the native app a real API. Because
services do not depend on Next.js, splitting into B later is a mechanical move.

## Consequences
- Easier: one repo, one deploy, shared validation schemas.
- Harder: UI and API scale together.
- Revisit: when the API serves heavy native traffic or a second team joins.

## Action Items
1. [x] `lib/services/*` with no framework imports.
2. [x] `/api/v1` handlers with uniform error format.
3. [x] `docs/API.md`.
