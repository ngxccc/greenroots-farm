---
status: Accepted
date: 2026-11-13
deciders: ngxccc
---

# 5. Database-Enforced Business Invariants

## Context

Inventory quantities, prices, and payment ownership are correctness-critical. Service-layer validation is bypassed by seed scripts, admin SQL, and future workers, so relying on it alone leaves the database able to hold impossible rows.

- **Target modules**: `apps/api/src/database/schemas`
- **Standard reference**: `docs/standards/database-and-migrations.md`
- **Extracted from**: the pre-split combined ADR (0001) during the 2026-11-18 ADR split.

## Decision

- Declare inventory, price, and order-amount invariants with Drizzle `check()`, so the generated migration and snapshot stay authoritative.
- Required checks include non-negative batch quantities, non-negative product prices, non-negative order amounts, and positive line-item quantities with non-negative unit prices.
- Require `payments.order_id IS NOT NULL OR payments.subscription_id IS NOT NULL` so a payment cannot be orphaned.
- Keep order status transitions in the domain service; they are not expressible as a row-level check.

## Positive Consequences

- Invalid rows are rejected regardless of which process writes them.
- The Drizzle snapshot records every invariant, so CI can detect drift.
- Error mapping is centralized: PostgreSQL `23514` becomes HTTP `422`.

## Negative Consequences / Risks

- A violated check surfaces as an HTTP `422` rather than a descriptive domain error unless mapped explicitly.
- Adding an invariant to a populated table requires a validated backfill first.

## Explicit Tradeoffs

- **Schema checks over service-only validation**: stronger guarantees at the cost of migration work when rules change.
- **Service-level FSM over database trigger**: status transitions need actor context and side effects, which a check cannot express.
