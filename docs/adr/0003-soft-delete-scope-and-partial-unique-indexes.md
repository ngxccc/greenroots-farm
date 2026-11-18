---
status: Accepted
date: 2026-11-13
deciders: ngxccc
---

# 3. Soft-Delete Scope and Partial Unique Indexes

## Context

Some domain records must survive deletion because orders, subscriptions, or audit views still reference them. Applying `deleted_at` everywhere would add filtering to every query and still not recover history that snapshots already preserve. A blanket `UNIQUE` constraint would also block reusing a slug or email after a soft delete.

- **Target modules**: `apps/api/src/database/schemas`
- **Extracted from**: the pre-split combined ADR (0001) during the 2026-11-18 ADR split.

## Decision

- Exactly five tables carry `deleted_at`: `users`, `plots`, `categories`, `products`, and `subscription_plans`.
- Each of those tables gets a partial unique index scoped with `WHERE deleted_at IS NULL`.
- The other thirteen tables must not add `deleted_at`; use hard delete or a domain status instead.

## Positive Consequences

- History for the tables that need it is preserved without a tombstone table.
- Names, slugs, and emails become reusable after deletion.
- Queries for every other table stay simple.

## Negative Consequences / Risks

- Every query and relation touching the five tables must filter `deleted_at IS NULL`; a missed filter leaks deleted rows.
- The list is closed by decision, so a new soft-deletable table needs an ADR update.

## Explicit Tradeoffs

- **Selective soft delete over universal soft delete**: five tables absorb the filtering cost instead of eighteen.
- **Partial unique index over application-only uniqueness**: the database enforces the rule even under concurrent writes.
