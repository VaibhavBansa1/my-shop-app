# ADR-0001: PostgreSQL with Row-Level Security for multi-tenancy

**Status:** Accepted
**Date:** 2026-11-01
**Deciders:** Vaibhav Bansal (owner)

## Context
Anyone can sign up and create an organization. Accounting data is sensitive: one
shop must never see another shop's customers, sales or balances. The team is one
person, so the solution must be cheap to run and hard to get wrong.

## Decision
One PostgreSQL database, one shared schema. Every tenant table has `org_id uuid not null`.
Row-Level Security is enabled **and forced** on every tenant table with the policy
`org_id = current_setting('app.org_id', true)::uuid`. The application connects as
`shop_app`, a role that is not the table owner and has no `BYPASSRLS`. Each request
sets `app.org_id` with `SET LOCAL` inside its own transaction.

## Options Considered

### Option A: Shared schema + RLS (chosen)
| Dimension | Assessment |
|---|---|
| Complexity | Medium — policies + a transaction wrapper |
| Cost | Lowest — one database |
| Scalability | Good to tens of thousands of tenants; can partition later |
| Team familiarity | SQL is familiar; RLS is new but small |

**Pros:** isolation enforced by the database even if app code forgets a `WHERE`; one migration path; easy cross-tenant admin queries via the owner role.
**Cons:** must never run app queries as the owner; every query runs in a transaction.

### Option B: Shared schema, `WHERE org_id = $1` in app code only
| Complexity | Low | Cost | Lowest | Scalability | Good | Familiarity | High |

**Pros:** simplest. **Cons:** one missed `WHERE` leaks data across shops. Not acceptable for accounting data.

### Option C: Schema per tenant / database per tenant
| Complexity | High | Cost | Higher (per-tenant objects, migrations × N) | Scalability | Poor past a few thousand schemas | Familiarity | Medium |

**Pros:** strongest isolation, easy per-tenant restore. **Cons:** migrations and connection pools multiply with each tenant.

## Trade-off Analysis
B is too risky; C is too expensive to operate for a one-person team with many small
tenants. A gives database-enforced isolation at the cost of a little discipline,
which we encode once in `lib/db.js#withOrg` and verify with tests.

## Consequences
- Easier: adding a feature cannot accidentally leak data across organizations.
- Harder: background jobs must also call `withOrg`; superuser/owner connections are for migrations only.
- Revisit: a large customer wanting dedicated infrastructure or data residency.

## Action Items
1. [x] `shop_owner` runs migrations; `shop_app` is runtime-only (`db/roles.sql`).
2. [x] `ENABLE` + `FORCE ROW LEVEL SECURITY` on every tenant table.
3. [x] Integration test: user of org A cannot read/write org B (`test/isolation.test.js`).
