---
status: Accepted
date: 2026-11-13
deciders: ngxccc
---

# 4. Integer VND Money Convention

## Context

GreenRoots Farm prices in Vietnamese đồng, which has no minor unit. Floating-point or `numeric` money invites rounding drift in totals, refunds, and delivery-fee arithmetic. The schema, the API DTOs, and shared JSONB contracts also need one naming rule so a reviewer can tell storage from transport.

- **Target modules**: `apps/api`, `packages/shared`
- **Column reference**: `Database_Schema.dbml`
- **Extracted from**: the pre-split combined ADR (0001) during the 2026-11-18 ADR split.

## Decision

- Store money as integer VND in PostgreSQL.
- Use the DBML column names: `base_price`, `shipping_fee`, `subtotal`, `discount_amount`, `total_amount`, `amount`, and `unit_price` _(later extended with `products.sale_price` / `salePriceVnd` in ADR-0025)_.
- Add the `Vnd` suffix at API and JSONB boundaries: `basePriceVnd`, `baseFeeVnd`, `perKmRateVnd`, `shippingFeeVnd`.
- Never use `numeric`, `float`, or `double` for money.

## Positive Consequences

- All money arithmetic is exact integer arithmetic.
- The `Vnd` suffix makes it obvious that a transport value is an integer amount, not a decimal.
- Shared contracts and DTOs name the same concept consistently.

## Negative Consequences / Risks

- Currency changes or multi-currency support would need a different representation.
- Percentages and per-kilometre rates still require explicit rounding rules.

## Explicit Tradeoffs

- **Integer over decimal**: exactness and simplicity win because VND has no minor unit.
- **Boundary suffix over uniform names**: the extra suffix is a deliberate reminder that storage and transport differ.
