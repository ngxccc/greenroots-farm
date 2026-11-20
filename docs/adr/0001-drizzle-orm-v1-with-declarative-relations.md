---
status: Accepted
date: 2026-11-13
deciders: ngxccc
---

# 1. Drizzle ORM v1 with Declarative Relations

## Context

The first backend slice needs one persistence toolkit for `apps/api`. `Database_Schema.dbml` is the schema source of truth and models 18 tables. The earlier plan left room for a query builder plus hand-written SQL, which would split relation metadata away from the schema.

- **Target module**: `apps/api/src/database`
- **Schema reference**: `Database_Schema.dbml`
- **Extracted from**: the pre-split combined ADR (0001) during the 2026-11-18 ADR split.

## Decision

- Use Drizzle ORM v1 and `drizzle-kit`, tracking latest releases without hard version pinning.
- Define relation graphs with `defineRelations` rather than ad-hoc joins.
- Apply `snakeCase.table` for database naming so TypeScript property names stay `camelCase`.
- Model all 18 tables from `Database_Schema.dbml`; add no speculative tables. _(Amended by ADR-0019, which added `staff_audit_logs` as the 19th table.)_

## Positive Consequences

- Relation metadata lives next to the table definitions, so queries and migrations share one source.
- Schema changes and generated migrations stay in lockstep through `drizzle-kit`.
- Column naming is mechanical, removing a class of casing bugs.

## Negative Consequences / Risks

- Drizzle v1 is young; a breaking release can require a coordinated upgrade across the API.
- `snakeCase.table` is a global convention, so a single hand-written column name that ignores it becomes inconsistent.

## Explicit Tradeoffs

- **ORM over hand-written SQL**: relation typing and migration generation win over total SQL control.
- **Latest releases over pinned versions**: faster fixes win over reproducible dependency resolution, which `bun.lock` already provides.
