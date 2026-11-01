# ADR-0005: Plain parameterized SQL with `pg`, no ORM

**Status:** Accepted
**Date:** 2026-11-01
**Deciders:** Vaibhav Bansal (owner)

## Context
The owner asked why the code uses raw SQL instead of an ORM (Prisma, Drizzle, TypeORM).
The core guarantees of this app live in PostgreSQL itself: Row-Level Security per
organization, `SET LOCAL` request context, deferred constraint triggers that keep
vouchers balanced, column-level `UPDATE` grants that make vouchers append-only, and
composite `(org_id, id)` foreign keys. Reports are aggregate queries.

## Decision
Use the `pg` driver with parameterized SQL (`$1, $2 …`) in `lib/services/*`, schema in
numbered SQL migrations (`db/migrations`), and zod validation at the API edge.

## Options Considered

### Option A: `pg` + SQL migrations (chosen)
| Complexity | Low | Cost | Free | Scalability | Full control of queries/indexes | Familiarity | SQL is universal |

**Pros:** RLS/transaction context is explicit in one place (`withOrg`); triggers, policies and
grants are first-class; report queries are readable and fast; no generated client.
**Cons:** no generated types; mapping rows to objects is manual.

### Option B: Prisma
| Complexity | Medium | Cost | Free | Scalability | Good | Familiarity | Popular |

**Pros:** typed client, schema DSL. **Cons:** RLS needs per-request `SET` inside interactive
transactions (easy to get wrong with its connection handling); policies, triggers and grants
still need raw SQL migrations; aggregates fall back to `$queryRaw` anyway.

### Option C: Drizzle / Kysely (type-safe query builders)
| Complexity | Low–Medium | Cost | Free | Scalability | Good | Familiarity | Growing |

**Pros:** typed queries close to SQL, work with `pg` and our `withOrg` client.
**Cons:** extra layer and types to maintain while the schema is still changing.

## Trade-off Analysis
The safety properties we care most about are enforced by the database, so the data layer
should make the database visible, not hide it. SQL injection is prevented by always passing
values as parameters (never string concatenation; the only dynamic SQL builds column lists
from fixed whitelists in code).

## Consequences
- Easier: auditing exactly what runs against the database; tuning reports.
- Harder: refactors need care because there are no compile-time column checks — covered by
  integration tests that run against a real Postgres as the real app role.
- Revisit: adopt **Kysely** (works on top of the same `pg` client, so `withOrg` stays) if the
  codebase moves to TypeScript or grows beyond a few thousand lines of queries.
