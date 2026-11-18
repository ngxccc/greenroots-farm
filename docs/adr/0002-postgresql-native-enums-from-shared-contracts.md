---
status: Accepted
date: 2026-11-13
deciders: ngxccc
---

# 2. PostgreSQL Native Enums Sourced from Shared Contracts

## Context

Status values such as `order_status`, `payment_method`, and `delivery_day` are consumed by the API, the storefront, and the backoffice. `Database_Schema.dbml` already models them as typed enums. An earlier database standard described "text plus CHECK constraint" instead, which would create two representations of the same domain.

- **Target modules**: `apps/api`, `packages/shared`
- **Contract reference**: `packages/shared/src` enum exports
- **Extracted from**: the pre-split combined ADR (0001) during the 2026-11-18 ADR split.

## Decision

- Generate PostgreSQL enum types with Drizzle `pgEnum` using values imported from `@greenroots/shared`.
- Application code and schemas must not redeclare enum values.
- Adding a status value requires a forward-only migration, never an ad-hoc string.

## Positive Consequences

- Invalid statuses are rejected by PostgreSQL even outside the API process.
- TypeScript and the database share one list of values, so drift is immediately visible.
- Storage is compact.

## Negative Consequences / Risks

- Adding an enum value is a migration, not a config change.
- Removing or reordering values requires a replacement type and a table rewrite.

## Explicit Tradeoffs

- **Native enums over text plus CHECK**: stronger guarantees win over painless value additions. The shared package already centralizes the values, so additions are rare and reviewed.
