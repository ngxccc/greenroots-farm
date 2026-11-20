---
status: Accepted
date: 2026-11-20
deciders: ngxccc
---

# 26. Batch Intake Timestamps, Server-Generated Codes, and HSD Threshold Boundary

## Context

Issue #82 (split from #23; parent epic #9; Backoffice consumer #47 `BO-03`; downstream dependents #81, #83, #34, #84) introduces `POST /api/v1/batches`, `GET /api/v1/batches`, and `GET /api/v1/batches/:id` in `apps/api/src/modules/inventory`. Reconciling #82 against the persisted schema, `FarmsModule`, and ADR-0022 through ADR-0025 surfaced five architectural conflicts and unstated prerequisites:

1. **`timestamptz` expiry in #82/#81 vs. `date` columns in `catalog.schema.ts` and ADR-0024**: `batches.harvest_date` and `batches.expiration_date` in `apps/api/src/database/schemas/catalog.schema.ts` are currently timezone-less `date` (`YYYY-MM-DD`) columns, and ADR-0024 explicitly kept them as `YYYY-MM-DD` to avoid schema churn during #21. However, #82 requires computing exact remaining shelf life against the 48-hour `near_expiry` threshold and rejecting already-expired intake with `422`, while #81 filters `expiry_date > NOW()`. Fresh produce harvested at 04:00 AM (`BUSINESS_RULES.HARVEST_START_HOUR`) with a 1-day shelf life expires at 04:00 AM the next day—calendar-date-only storage forces arbitrary end-of-day heuristics and causes +/-7h UTC vs. `Asia/Ho_Chi_Minh` drift.
2. **Omitted `seasonId` and cross-table lock ordering**: #82's summary mentions only `product`, `harvest date`, `shelfLifeDays` (HSD days), and `initialQuantity`, whereas `batches.season_id` is `NOT NULL` (`ON DELETE restrict`) and `TraceService` (`GET /api/v1/trace/:batchCode`) `INNER JOIN`s `seasons -> plots -> farms`. Without `seasonId` validation and `FOR SHARE` row locking, concurrent `PATCH /api/v1/seasons/:id` (`completed` transition) or `DELETE /api/v1/products/:id` (soft delete) could race past intake checks.
3. **Server-generated `batchCode` collisions under concurrency**: Clients are forbidden from supplying `batchCode`, yet generated codes must satisfy `batches_batch_code_uidx`, `BATCH_CODE_REGEX` (`^[A-Z0-9][A-Z0-9_-]{2,99}$` in `farms.interface.ts`), thermal label readability (#83/#47), and public URL non-enumeration (`/trace/:batchCode`) without leaking total farm production volume.
4. **Dual `near_expiry` threshold sources (`farms.flashSaleConfig` vs. `BUSINESS_RULES`)**: `BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD` (`48`) in `@greenroots/shared` is a static constant, while `farms.flash_sale_config.hoursThreshold` (exposed via `FarmSettingsService.getSettings()` in `FarmsModule`) is runtime-configurable per farm. Hardcoding `48` silently diverges from #34 whenever ops updates Farm Settings, whereas silently falling back to `48` in production hides missing farm configuration.
5. **Intake double-submission & DB check gaps**: Without `Idempotency-Key` enforcement, a staff double-tap on `BO-03` mints two distinct physical-inventory batches and QR codes. Meanwhile, `batches` currently checks only `initial_quantity >= 0` and `available_quantity >= 0`, lacking DB guards for `initial_quantity > 0`, `available_quantity <= initial_quantity`, and `expiration_date > harvest_date`.

- **Target modules**: `apps/api/src/modules/inventory`, `apps/api/src/modules/farms`, `apps/api/src/database/schemas`, `apps/api/src/database/seeds`, `packages/shared`
- **Issue**: #82 (split from #23; parent epic #9); consumers/dependents: #47 (`BO-03`), #81, #83, #34, #84
- **Spec**: `docs/design/batch-intake-and-hsd-formal-spec.md`
- **Related**: ADR-0004, ADR-0005, ADR-0008, ADR-0011, ADR-0012, ADR-0013, ADR-0021, ADR-0022, ADR-0023, ADR-0024 (partially superseded on `batches` date column types), ADR-0025

## Decision

- **Partially supersede ADR-0024 on `batches` timestamp types (`date` -> `timestamptz`)**:
  - Alter `batches.harvest_date` and `batches.expiration_date` in `apps/api/src/database/schemas/catalog.schema.ts` from `date` to `timestamp({ withTimezone: true, mode: "date" })` via one forward-only migration (`USING (<col>::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')` for existing rows), preserving the existing column names `harvest_date` and `expiration_date` (`batches_fefo_outbound_idx`) to minimize cross-module churn.
  - Require `harvestDate` in `POST /api/v1/batches` as an explicit ISO-8601 datetime with timezone/offset (`z.iso.datetime({ offset: true })`), reject future harvest instants (`harvestDate > now`), and compute `expirationDate = new Date(harvestDate.getTime() + shelfLifeDays * TIME_IN_MS.DAY)` (`shelfLifeDays` integer `1..3650`).
  - Update `TraceService`, `TraceRecordDto` (`traceBatchSummarySchema` using `z.iso.datetime()`), `trace.service.spec.ts`, `trace-cache.service.spec.ts`, `tier2-catalog.seeder.ts`, `seed-dates.constant.ts`, and OpenAPI contracts (`bun run types:sync`) atomically in the same change.
  - Add DB `CHECK` invariants per ADR-0005: `batches_initial_quantity_positive` (`initial_quantity > 0`), `batches_available_lte_initial` (`available_quantity <= initial_quantity`), and `batches_expiration_after_harvest` (`expiration_date > harvest_date`).
- **Require `seasonId`, `products -> seasons` `FOR SHARE` lock ordering, and Vietnam calendar comparison**:
  - Require `seasonId` alongside `productId`, `harvestDate`, `shelfLifeDays`, and `initialQuantity` in `POST /api/v1/batches`.
  - Inside the intake transaction, lock the referenced `products` row (`WHERE id = :productId AND deleted_at IS NULL FOR SHARE`) **before** locking `seasons` (`WHERE id = :seasonId FOR SHARE`) to prevent deadlocks across modules.
  - Allow intake for non-deleted products regardless of `products.isActive` (so staff can label stock before `sales` publishes a seasonal SKU), while restricting `seasons.status` strictly to `SeasonStatus.ACTIVE` or `SeasonStatus.HARVESTED` (matching ADR-0023 `HARVESTING` gates; `planning` and `completed` fail with `422 BATCH_SEASON_STATUS_INVALID`).
  - Compare `harvestDate` converted to its `Asia/Ho_Chi_Minh` calendar date (`YYYY-MM-DD`) against `seasons.startDate` (`date`), rejecting `harvestCalendarDateVn < season.startDate` with `422 BATCH_HARVEST_DATE_INVALID` so early-morning harvests (e.g., `04:00+07:00`, which is `21:00Z` the prior UTC day) do not trigger false off-by-one-day rejections.
- **Server-generated `BATCH-<YYYYMMDD>-<PRODUCT_TAG>-<RAND6>` with bounded `23505` retry**:
  - Generate `batchCode` server-side from the `Asia/Ho_Chi_Minh` harvest calendar date (`YYYYMMDD`), an uppercase alphanumeric tag derived from `product.slug` (capped at 6 chars), and 6 cryptographically random Crockford Base32 characters (`0-9A-HJKMNPQRSTVWXYZ`, omitting `I/L/O/U`), always conforming to `BATCH_CODE_REGEX`.
  - Execute each insert attempt in its own transaction boundary (or `SAVEPOINT`) with up to **3 attempts** on PostgreSQL `23505` (`batches_batch_code_uidx`), because PostgreSQL aborts the active transaction block on an unhandled unique violation.
  - Reject any client-supplied `batchCode` at the HTTP boundary (`400 UNRECOGNIZED_KEYS` via `.strict()`) and leave `batches.qrCodeUrl` as `null` at intake (#83 generates dynamic `traceUrl` from public origin).
- **Environment-scoped `FarmSettings` threshold resolution & intake status**:
  - Read `hoursThreshold` via `FarmSettingsService.getSettings()` (`FarmsModule` cache-aside `farm:settings:v1`).
  - In `NODE_ENV === "production"`, fail closed if the singleton `farms` row is missing (`404 FARM_NOT_FOUND`) or `flashSaleConfig.hoursThreshold` is non-positive (`422`), forcing ops to configure Farm Settings rather than silently applying a default. Only in `development` and `test` when `FARM_NOT_FOUND` occurs, log a warning and fall back to `BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD` (`48`).
  - Reject intake with `422 BATCH_EXPIRED_AT_INTAKE` when `expirationDate <= now`; otherwise assign `BatchStatus.NEAR_EXPIRY` when `(expirationDate.getTime() - now.getTime()) < hoursThreshold * TIME_IN_MS.HOUR`, else `BatchStatus.IN_STOCK`.
- **Idempotency, RBAC, and post-commit trace cache cleanup**:
  - Protect `POST /api/v1/batches` with `@Idempotent()` (`Idempotency-Key` UUID per ADR-0008) and restrict `POST /api/v1/batches`, `GET /api/v1/batches`, and `GET /api/v1/batches/:id` to `farm_staff`, `admin`, and `super_admin`.
  - After commit of `POST /api/v1/batches`, invoke `TraceCacheService.invalidateByBatchCodes([created.batchCode])` (fail-open, per ADR-0024) to clear any 30-second negative-cache marker.

## Positive Consequences

- Exact second-level `timestamptz` arithmetic unifies batch intake (#82), live stock filtering (#81 `expiration_date > NOW()`), expiry cron (#34), and public traceability (#21) without +/-7h timezone bugs or midnight guessing.
- `FOR SHARE` lock ordering (`products -> seasons`) guarantees a batch cannot be attached to a concurrently soft-deleted product or a `completed` season.
- Crockford Base32 random suffixes prevent public enumeration of farm production volume while staying legible on thermal QR stickers (#47/#83), and bounded retry isolates transient `23505` collisions cleanly.
- Production fail-closed threshold resolution guarantees batch intake never silently drifts from configured `farms.flash_sale_config` rules.

## Negative Consequences / Risks

- Partially superseding ADR-0024 requires updating `TraceService`, `TraceRecordDto`, `trace.service.spec.ts`, `trace-cache.service.spec.ts`, and `tier2-catalog.seeder.ts` so `harvestDate` and `expirationDate` serialize as ISO-8601 datetimes rather than `YYYY-MM-DD`, requiring `#45` (`SF-03`) to format ISO timestamps.
- Backoffice `BO-03` (#47) must supply an ISO-8601 `harvestDate` with offset (e.g., defaulting to the browser's current timestamp in `+07:00`) rather than a bare `YYYY-MM-DD` string.
- Adding `batches_initial_quantity_positive`, `batches_available_lte_initial`, and `batches_expiration_after_harvest` constraints assumes all existing seeded or migrated rows satisfy `initial_quantity > 0`, `available_quantity <= initial_quantity`, and `expiration_date > harvest_date`.

## Explicit Tradeoffs

- **Both `harvestDate` and `expirationDate` as `timestamptz` (in-place `ALTER COLUMN` migration) over keeping `date` (`23:59:59+07:00` convention) or 3-phase expand-and-contract**: eliminates timezone/midnight heuristics and matches #81/#82/#34 instant semantics in one clean migration while the project is pre-production, at the cost of updating ADR-0024's `TraceRecordDto` date strings.
- **`BATCH-<YYYYMMDD>-<PRODUCT>-<RAND6>` + 3-attempt `23505` retry over PostgreSQL `SEQUENCE` or ULID**: avoids sequential volume leakage and migration of daily-reset counters while keeping labels short and readable for warehouse staff, at the cost of a bounded retry wrapper around the transaction.
- **Prod fail-closed `FarmSettings` threshold over universal fallback to `48`**: prevents silent divergence between intake classification and `farms.flash_sale_config` in production while keeping isolated dev/test harnesses ergonomic.
- **`@Idempotent()` on `POST /api/v1/batches` over relying on client button disabling**: guarantees double-clicks or mobile retries on farm tablets do not mint duplicate physical batches and QR labels, at the cost of requiring an `Idempotency-Key` UUID header from `BO-03` (#47).
