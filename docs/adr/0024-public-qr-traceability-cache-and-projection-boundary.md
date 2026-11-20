---
status: Accepted
date: 2026-11-20
deciders: ngxccc
---

# 24. Public QR Traceability Cache, Epoch Invalidation, and Projection Boundary

## Context

Issue #21 (parent epic #8; Storefront consumer #45 `SF-03`; QR label producer #83) introduces the public, unauthenticated batch traceability endpoint `GET /api/v1/trace/:batchCode` with a `< 1.5s` latency target and Redis caching. Reconciling #21 against the codebase and ADR-0021 through ADR-0023 surfaced five architectural tensions that require durable commitments:

1. **Issue caching premise vs. ADR-0023 mutability**: Issue #21 describes caching for `"harvested seasons"`, assuming harvested cultivation records are frozen. In reality, ADR-0023 allows all `FarmingActionType` entries (including `correction` logs) during `harvested` and still permits `correction` logs during `completed`. In addition, `batches.status` transitions via FEFO checkout (#84) and the expiry cron (#34), `plots.soilTestResult`/`waterTestResult` are editable via `PATCH /api/v1/plots/:id` (ADR-0021), and `farms.certificationUrl` is editable via `PATCH /api/v1/farms/settings` (ADR-0021). Caching indefinitely on `season.status === 'harvested'` without cross-entity invalidation would serve stale VietGAP records.
2. **Eager write-through rebuild vs. concurrent writes and fan-out**: Because `POST /api/v1/seasons/:id/logs` holds `FOR SHARE` on `seasons` (ADR-0023), multiple staff members can write logs concurrently; eager cache rebuilds after commit could overwrite newer snapshots with older ones, and `PATCH /api/v1/farms/settings` or `PATCH /api/v1/plots/:id` would trigger unbounded multi-table fan-out across historical batches. Furthermore, `batches` in `apps/api/src/database/schemas/catalog.schema.ts` currently lacks an index on `season_id` for efficient season-to-batch invalidation lookups.
3. **Storefront mock contract vs. persisted schema**: `apps/storefront/src/types/storefront.types.ts` (`BatchTraceRecord`) and `apps/storefront/src/services/storefront.service.ts` still assume flat non-null mock fields (`unitLabel`, `soilPh`, `waterPh`, `heavyMetalsPass`, `certificationUrl`), flat `farmingLogs`, and an old `/api/v1/farms/trace/:batchCode` TODO, whereas the database has `products.unit`, nullable `farms.certificationUrl`, nullable `plots.soilTestResult` and `waterTestResult`, and ADR-0023 `correctsLog`/`correctedBy` DAG linkage.
4. **Public PII, inventory redaction, and soft-delete history**: Exposing internal stock (`initialQuantity`, `availableQuantity`), `waste_logs`, `farms.bankInfo`, or staff `users.id` UUIDs on an unauthenticated endpoint violates least-privilege boundaries. Conversely, filtering out soft-deleted `plots` or `products` (`deletedAt IS NOT NULL`) would break QR codes printed on previously sold packaging.
5. **Redis eviction collision, stampede, and negative lookup amplification**: An `INCR` farm-version key initialized on a missing key starts at `1`, colliding silently if `GET` also defaults missing keys to `"1"`. Meanwhile, invalidating the farm epoch or scanning non-existent batch codes could trigger cache stampedes or database scan storms.

- **Target modules**: `apps/api/src/modules/farms`, `apps/api/src/database/schemas`, `apps/api/src/common/constants`, `packages/shared`
- **Issue**: #21 (parent epic #8); downstream consumers: #45 (`SF-03`), #83; future invalidation callers: #82, #84, #34
- **Spec**: `docs/design/qr-traceability-formal-spec.md`
- **Related**: ADR-0003, ADR-0007, ADR-0011, ADR-0012, ADR-0013, ADR-0021, ADR-0022, ADR-0023, ADR-0026 (partially supersedes `batches.harvestDate` / `batches.expirationDate` column and DTO format from `date` `YYYY-MM-DD` to `timestamptz` ISO-8601)

## Decision

- **Canonical route, module ownership, and acyclic seam**:
  - Expose `GET /api/v1/trace/:batchCode` via `TraceController` inside `FarmsModule` using `FARMS_ROUTES.TRACE_BASE` (`"trace"`) and `FARMS_ROUTES.TRACE_BY_BATCH_CODE` (`":batchCode"`).
  - Keep `TraceService` and `TraceCacheService` in `FarmsModule` and export `TraceCacheService` so downstream `InventoryModule` (#82, #34) and `OrdersModule` (#84) can import `FarmsModule` for cache invalidation without creating circular module dependencies.
- **Hybrid Lazy Cache-Aside with `farm_ver` epoch, Lua stale-write guard, and `batches_season_id_idx`**:
  - Cache positive trace projections under `trace:batch:v1:<BATCH_CODE>` with a **900-second (15-minute)** safety-net TTL (alongside `farmVersion` embedded in the cached envelope) and negative misses under `trace:batch:miss:v1:<BATCH_CODE>` with a **30-second** TTL.
  - Store the singleton farm invalidation epoch under `trace:farm_ver:v1` as an opaque UUID nonce: `GET` initializes it with `SET ... NX` when missing before reading via `MGET`, and `FarmSettingsService.updateSettings` overwrites it unconditionally with a fresh UUID (`O(1)`, zero fan-out) after commit.
  - Add `index("batches_season_id_idx").on(table.seasonId)` to `batches` in `apps/api/src/database/schemas/catalog.schema.ts` via one forward-only migration per `docs/standards/database-and-migrations.md` §1.
  - After commit in `FarmingLogsService.createLog`, `SeasonsService.updateSeason`, and `PlotsService.updatePlot`, look up linked `batchCode` values via `batches.seasonId` and pipeline `UNLINK trace:batch:v1:<CODE>` + `SET trace:batch:invalidated_at:<CODE> <nowMs> EX 60` (`TraceCacheService.invalidateByBatchCodes`). Backfill on `GET` uses an atomic Lua script checking `NX` and `invalidated_at` (matching ADR-0021).
  - Never perform eager write-through cache rebuilds on write paths. Always fail open to PostgreSQL when Redis is unavailable, coalesce concurrent cache-miss reads per `:batchCode` in-process via a singleflight `Map`, and emit `Cache-Control: no-cache` on HTTP responses so browsers/proxies do not hold uninvalidatable copies.
- **Nested, schema-faithful, redacted public projection (`TraceRecordDto`)**:
  - Replace the flat storefront mock shape with a nested closed projection containing `batch` (`batchCode`, `harvestDate` and `expirationDate` — originally `YYYY-MM-DD` strings, subsequently migrated to `timestamptz` / ISO-8601 datetimes under ADR-0026, `status`), `product` (`id`, `name`, `slug`, `unit`, `imageUrls`), `farm` (`name`, `legalName`, `tagline`, `address`, `certificationUrl`), `plot` (`plotCode`, `name`, `areaSqm`, nullable `soilTestResult`, nullable `waterTestResult`), `season` (`id`, `seasonName`, `startDate`, `expectedHarvestDate`, `status`), and cultivation timeline (`farmingLogs`, `totalLogCount`, `logsTruncated`).
  - Omit `initialQuantity`, `availableQuantity`, `waste_logs`, `farms.bankInfo`, `farms.emails`, `farms.hotlines`, `farms.shippingConfig`, `farms.flashSaleConfig`, `deletedAt`, and staff `users.id` UUIDs—projecting only `recordedByName` (`users.fullName`) on logs and reverse corrections.
  - Allow trace reads even if the historical `plot` or `product` was subsequently soft-deleted (`deletedAt IS NOT NULL`), consistent with ADR-0022.
  - Return `farmingLogs` sorted chronologically ascending (`loggedAt:asc`, `id:asc`), capped at **200** entries; when `totalLogCount > 200`, select the **latest 200** entries (`DESC LIMIT 200`, then reverse to `ASC`) with `logsTruncated: true`, while still hydrating `correctsLog` and `correctedBy` linkage from PostgreSQL.
- **Strict `:batchCode` normalization, RFC 9457 error registration, and public rate limit**:
  - Normalize `:batchCode` via `trim().toUpperCase()` and validate `^[A-Z0-9][A-Z0-9_-]{2,99}$` at the route boundary (`400 VALIDATION_FAILED` for malformed input; `404 BATCH_NOT_FOUND` registered in `@greenroots/shared` for missing codes).
  - Decorate the route with `@Public()`, `@SkipThrottle({ default: true, auth: true })`, and `@Throttle({ public: { limit: 300, ttl: 60000 } })`.

## Positive Consequences

- `harvested` and `completed` seasons reflect new `correction` logs immediately upon `POST /seasons/:id/logs` commit without waiting for TTL expiry, and farm certification updates invalidate all cached traces in `O(1)`.
- Concurrent `FOR SHARE` log writes and `PATCH /farms/settings` updates cannot pin stale snapshots in Redis or trigger multi-table rebuild storms.
- Public consumers never receive fabricated `0`/`false` lab readings when `soilTestResult` or `waterTestResult` is `null`, and historical QR labels on sold packaging keep resolving after product or plot soft deletion.
- Keeping `batches.expirationDate` as `YYYY-MM-DD` during #21 exposed `TraceCacheService` without immediate schema churn while leaving `#82` free to upgrade `batches` timestamps to `timestamptz` cleanly in ADR-0026.

## Negative Consequences / Risks

- Until `#82`, `#34`, and `#84` are implemented and wired to `TraceCacheService.invalidateByBatchCodes()`, out-of-band or future `batches.status` changes can remain cached up to the 15-minute TTL (or 30 seconds for newly created batches that hit a recent negative cache).
- When `farms.certificationUrl` changes via `PATCH /farms/settings`, rotating `trace:farm_ver:v1` invalidates all warm trace keys at once, shifting spike traffic to the in-process singleflight coalescer and PostgreSQL.
- Storefront `#45` (`SF-03`) must refactor `BatchTraceRecord` and `TraceView` to consume the nested OpenAPI DTO produced by `bun run types:sync`.

## Explicit Tradeoffs

- **Lazy invalidation (`UNLINK` + UUID `farm_ver` epoch + 900s TTL) over eager write-through rebuild or 24h `harvested`-only caching**: eliminates concurrent write-overwrite races (`FOR SHARE`), avoids `farms`/`plots` write amplification, and honors ADR-0023 post-harvest corrections, at the cost of a bounded 15-minute window for unhooked `batches` mutations and one `batches_season_id_idx` migration.
- **Nested nullable DTO over flat `BatchTraceRecord` mock compatibility**: guarantees compliance accuracy (`null` lab tests remain `null`) and preserves VietGAP `correction` DAG visibility, at the cost of updating `#45` frontend types.
- **Latest-200 chronological slice over earliest-200 or forced pagination**: protects `< 1.5s` payload bounds while guaranteeing harvest and late `correction` logs remain visible in single-shot RSC loads, at the cost of omitting early pre-planting entries only when a single season exceeds 200 logs.
- **Redacted `recordedByName` and omitted `staffId`/stock counts over full internal projection**: prevents internal staff UUID and inventory leakage on an unauthenticated endpoint while preserving human attribution for VietGAP transparency.
