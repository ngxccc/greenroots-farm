---
status: Accepted
date: 2026-11-13
deciders: ngxccc
---

# 6. Single Database URL with Normalized SSL for Runtime and Migrations

## Context

The API and `drizzle-kit` must connect to the same database, but managed providers expose pooler hosts and legacy SSL modes. Two connection paths that disagree on SSL or host format cause the classic "the API works, migrations fail" split. Discrete `DB_*` variables also predate the single-URL convention.

- **Target module**: `apps/api/src/config`
- **Extracted from**: the pre-split combined ADR (0001) during the 2026-11-18 ADR split.

## Decision

- `DB_URL` is the canonical runtime and migration connection string.
- Discrete `DB_*` variables remain only as a local fallback.
- One `normalizeDatabaseUrl()` implementation strips `-pooler.` hosts and upgrades legacy SSL modes to `verify-full` for both the API and `drizzle-kit`.
- `PORT` and `JWT_ACCESS_SECRET` accept their legacy aliases only as fallbacks.

## Positive Consequences

- Runtime and migration behaviour cannot diverge on SSL or host selection.
- A single secret in Doppler configures every database consumer.
- Legacy environments keep working during migration.

## Negative Consequences / Risks

- `verify-full` requires a valid certificate chain; a misconfigured local certificate fails the connection.
- Aliases can linger and hide incomplete environment cleanup.

## Explicit Tradeoffs

- **One URL plus normalization over separate runtime and migration URLs**: consistency wins over per-tool tuning.
- **Strict SSL over permissive modes**: transport security wins over ease of local setup.
