# ADR-0003: Server-side sessions with scrypt-hashed passwords

**Status:** Accepted
**Date:** 2026-11-01
**Deciders:** Vaibhav Bansal (owner)

## Context
We need sign-up/sign-in for the web app now and for a native app later. We want to
be able to sign a user out of every device instantly (e.g. a fired cashier).

## Decision
Email + password. Passwords hashed with Node's built-in `crypto.scrypt`
(N=16384, r=8, p=1, 64-byte key, 16-byte salt; parameters stored in the hash string).
On sign-in we create a random 32-byte token, store only `sha256(token)` in
`sessions`, and give the token to the client: as an `HttpOnly; SameSite=Lax; Secure`
cookie for browsers, or in the JSON body for native clients that ask for it, which
then send `Authorization: Bearer`.

## Options Considered

### Option A: DB sessions (chosen)
| Complexity | Low | Cost | One indexed lookup per request | Scalability | Fine; cache later | Familiarity | High |

**Pros:** instant revocation, nothing secret in the client beyond a random token, no native dependency.
**Cons:** a DB read per request.

### Option B: JWT access + refresh tokens
| Complexity | Medium | Cost | No lookup | Scalability | Excellent | Familiarity | Medium |

**Pros:** stateless. **Cons:** revocation needs a denylist anyway; key management; easy to misuse.

### Option C: Third-party auth (Auth0, Clerk, Firebase)
| Complexity | Low | Cost | Monthly fee per user | Scalability | Excellent | Familiarity | Medium |

**Pros:** MFA, social login for free. **Cons:** vendor lock-in and cost; user data leaves our database.

## Trade-off Analysis
For a small business app, instant revocation and zero vendor cost beat stateless
scaling. The same token works for web and native.

## Consequences
- Easier: "sign out everywhere", removing staff, auditing logins.
- Harder: we own password reset and MFA (planned).
- Revisit: add TOTP 2FA for owners/admins; email verification once email sending exists.

## Action Items
1. [x] `lib/auth/password.js` (scrypt, constant-time compare).
2. [x] `sessions` table with hashed tokens and expiry.
3. [x] Login throttling table and checks.
4. [ ] Password reset by email (needs an email provider).
