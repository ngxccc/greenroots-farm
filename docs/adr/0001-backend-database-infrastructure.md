---
status: Accepted
date: 2026-11-13
deciders: ngxccc
---

# 1. Backend and Database Infrastructure Baseline

## Context

GreenRoots Farm's first backend slice establishes the API runtime, PostgreSQL schema, shared domain contracts, and the boundaries that later modules build on. `Database_Schema.dbml` is the schema source of truth, and the Step 1 runbook constrains scope: no checkout/PayOS SDK, no background workers or cron, no shipping algorithms, and no B2B modules.

Several standards were written before the schema and runbook were finalized. This ADR records the decisions that resolve those drifts so code, standards, and glossaries stay consistent.

- **Target modules**: `apps/api`, `packages/shared`
- **Spec reference**: `Backend_Setup_Execution_Runbook.md` (Step 1)
- **Schema reference**: `Database_Schema.dbml`

## Decision

### 1. Drizzle ORM v1 with declarative relations

- Pin `drizzle-orm@^1.0.0-rc.5-169397b` and `drizzle-kit@^1.0.0-rc.5-ab785fc`.
- Use `defineRelations` for relation graphs and `snakeCase.table` for database naming.
- Model all 18 tables from `Database_Schema.dbml`; no speculative tables.

### 2. PostgreSQL enum types sourced from shared contracts

- Generate enums with Drizzle `pgEnum` from `@greenroots/shared` values. Application code must not redeclare enum values.
- `Database_Schema.dbml` already models typed enums, so PostgreSQL enum types are the canonical representation. This supersedes the earlier "text plus CHECK constraint" wording in the database standard.

### 3. Explicit soft-delete scope

- Exactly five tables carry `deleted_at`: `users`, `plots`, `categories`, `products`, and `subscription_plans`.
- Each table has a partial unique index scoped with `WHERE deleted_at IS NULL`.
- The other thirteen tables must not add `deleted_at`.

### 4. Money representation and naming

- Money is stored as integer VND.
- Database columns use the DBML names: `base_price`, `shipping_fee`, `subtotal`, `discount_amount`, `total_amount`, `amount`, and `unit_price`.
- API DTOs and JSONB contracts add the `Vnd` suffix (`basePriceVnd`, `baseFeeVnd`, `perKmRateVnd`). The suffix is a boundary convention, not a column convention.

### 5. Password and token cryptography

- Passwords use `node:crypto` scrypt with `N=16384`, `r=8`, `p=5`, a 64-byte key, a 16-byte salt, and the versioned format `s1$<salt>$<hash>`.
- Verification uses `timingSafeEqual` with a strict length check.
- Refresh tokens are opaque 256-bit hex strings (never JWT), stored as SHA-256 hashes.

### 6. Instant revocation with fail-open Redis

- `JwtAuthGuard` checks `auth:revoked:<userId>` with a 15-minute TTL.
- If Redis is unavailable, the guard logs a warning, fails open, and opens a 30-second degraded-mode circuit to avoid per-request timeouts. A successful call closes the circuit and logs recovery.
- This follows the runbook's availability requirement. The concurrency standard's fail-closed rules apply to stock, payments, and idempotency, not to session revocation.

### 7. RFC 9457 problem documents with static URNs

- Errors return `application/problem+json` with `type` as `/errors/<slug>`.
- PostgreSQL `P0001` maps to HTTP 403, `23503` to HTTP 409, and `23514` (check violation) to HTTP 422.
- Vietnamese client-facing messages stay centralized in `apps/api/src/common/constants/messages.constant.ts`.

### 8. Append-only farming logs

- `farming_logs` is protected by `trg_immutable_farming_logs` and `prevent_farming_log_mutation()`, which reject UPDATE and DELETE.
- The trigger is installed by a forward-only custom migration.

### 9. Seeded baseline data

- A three-tier seeder populates reference, catalog, and operational data.
- `--clean` truncates all application tables and reseeds; truncation is blocked when `NODE_ENV=production`.
- Seed dates are relative to the run date so demo batches and subscriptions do not expire on a hardcoded calendar day.
- Demo credentials are local development fixtures, not production secrets.

### 10. Database-enforced business invariants

- Inventory, price, and order amount invariants use Drizzle `check()` definitions, so the generated migration and snapshot stay authoritative.
- `payments` requires either `order_id` or `subscription_id`, preventing orphaned transactions.

### 11. Environment and migration URL handling

- `DB_URL` is the canonical runtime and migration connection string; discrete `DB_*` variables are the local fallback.
- One `normalizeDatabaseUrl()` implementation strips `-pooler.` hosts and upgrades legacy SSL modes to `verify-full` for both the API and `drizzle-kit`.
- `PORT` and `JWT_ACCESS_SECRET` accept their legacy aliases only as fallbacks.

### 12. Scalar API reference

- `@scalar/nestjs-api-reference@1.2.x` renders `/api/docs` from the generated OpenAPI document at `/openapi.json`.
- The document version comes from `apps/api/package.json`; no duplicate version constant exists.

## Positive Consequences

- The API starts with validated environment configuration, a schema-backed Drizzle client, OpenAPI/Scalar docs at `/api/docs` and `/openapi.json`, and global authentication, RBAC, and error plumbing.
- Standards and glossaries use DBML column names and shared enum names; `packages/shared/GLOSSARY.md` now references `DeliveryDay`.
- Future modules must extend this baseline rather than introduce parallel enum, naming, or error conventions.
- CHECK constraints and migration snapshots are generated from one schema, so database drift is detectable in CI.
- Seeding is repeatable at any date and never leaves expired demo inventory.

## Negative Consequences / Risks

- `bun run types:sync` points at an `apps/api` script that does not exist yet. The OpenAPI-to-TypeScript generation pipeline must be added before contract-first tests depend on it.
- Seeding is only production-guarded through truncation. A later change should refuse all seed runs in production unless an explicit override is provided.
- `JWT_ACCESS_SECRET` has a development default. Production should fail fast when the secret is missing instead of starting with a known value.
- `bun run check` cannot pass until `apps/storefront` and `apps/backoffice` exist. CI runs `check-types` plus `lint:api` in the interim.
- `apps/api/GLOSSARY.md` remains planned. Create it with the first backend domain feature, not as an empty file.
- `BullModule` is registered for connection only; no processors or queues are defined, so malformed queue payloads are not exercised yet.
- Step 1 deliberately excludes checkout/PayOS SDK integration, background workers or cron, shipping algorithms, and B2B modules. Those gaps are scope boundaries, not regressions.

## Explicit Tradeoffs

- **PostgreSQL enums vs text plus CHECK**: Native enums give type safety and compact storage but require a migration to add a value. The schema source of truth already models enums, so native types win.
- **Fail-open Redis vs fail-closed revocation**: Availability wins for session revocation; stock, payment, and idempotency paths remain fail-closed.
- **Integer VND vs decimal money**: Integer arithmetic avoids floating-point drift and matches VND's lack of minor units, at the cost of explicit conversion at API boundaries.
- **Soft delete with partial unique indexes vs hard delete**: Five tables keep history and can reuse names after deletion, at the cost of filtering `deleted_at IS NULL` in every query.
- **Schema-generated CHECK constraints vs service-only validation**: The database rejects invalid rows even outside the API, at the cost of mapping `23514` to a client error instead of returning a generic `500`.
- **Relative seed dates vs fixed fixture dates**: Demos stay valid whenever they run, at the cost of non-deterministic fixture values across days.
