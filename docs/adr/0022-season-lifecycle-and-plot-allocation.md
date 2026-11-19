---
status: Accepted
date: 2026-11-19
deciders: ngxccc
---

# 22. Season Lifecycle, Plot Allocation, and Delete Guards

## Context

Issue #79 (split from #19; parent epic #8; Backoffice consumer #43; downstream consumers #20 and #82) introduces the `seasons` lifecycle API under `apps/api/src/modules/farms`: `GET`/`POST /api/v1/seasons` and `GET`/`PATCH`/`DELETE /api/v1/seasons/:id`. Reconciling #79 against the existing schema, triggers, and ADR-0021 surfaced four structural tensions that require durable architectural commitments:

1. **Issue terminology vs. persisted schema**: Issue #79 mentions a "crop name" and `startDate <= endDate`, whereas `seasons` in `apps/api/src/database/schemas/farm.schema.ts` already defines `seasonName` (`varchar(255)`) and `expectedHarvestDate` (`date`), and both `tier2-catalog.seeder.ts` and Storefront `trace-view.tsx` already consume `seasonName`. Furthermore, `seasons` lacks a database `CHECK (start_date <= expected_harvest_date)` constraint.
2. **Concurrent plot allocation & lock ordering**: `PlotsService.deletePlot` (ADR-0021) locks a live `plots` row (`FOR UPDATE`) before checking `seasons` in `planning` or `active` status. Unconstrained `POST /api/v1/seasons` or `PATCH /api/v1/seasons/:id` could link a season to a concurrently soft-deleted plot, invert lock order (`seasons -> plots` deadlock), or activate multiple concurrent seasons on the same plot, fragmenting VietGAP traceability.
3. **`DELETE` guard vs. `farming_logs` immutability trigger**: `batches.seasonId` uses `ON DELETE RESTRICT`, whereas `farmingLogs.seasonId` uses `ON DELETE CASCADE` (`apps/api/src/database/schemas/farm.schema.ts`) paired with the `trg_immutable_farming_logs` trigger (`apps/api/docs/adr/0001-append-only-farming-logs.md`), which raises `FARMING_LOG_IMMUTABLE` (mapped to HTTP `403` by `GlobalExceptionFilter`). Checking only `batches` before deleting a `planning` season that already has a `farming_logs` entry would fire the cascade and surface a misleading `403` instead of `409`.
4. **Calendar date drift & post-activation mutability**: PostgreSQL stores `seasons.start_date` and `seasons.expected_harvest_date` as timezone-less `date` columns, and historical seasons (`harvested`, `completed`) underpin immutable farming logs (`#20`) and batch traceability (`#21`, `#82`).

- **Target modules**: `apps/api/src/modules/farms`, `apps/api/src/database/schemas`, `apps/api/src/common/schemas`, `packages/shared`
- **Issue**: #79 (split from #19); backoffice consumer: #43; downstream consumers: #20, #21, #82
- **Spec**: `docs/design/season-lifecycle-formal-spec.md`
- **Related**: ADR-0001, ADR-0003, ADR-0005, ADR-0011, ADR-0012, ADR-0013, ADR-0021, `apps/api/docs/adr/0001-append-only-farming-logs.md`

## Decision

- **Preserve canonical `seasons` columns & enforce date-range `CHECK`**:
  - Keep `seasonName`, `startDate`, and `expectedHarvestDate` on `seasons` as the single schema and API contract (mapping issue #79's "crop name" to `seasonName` and `endDate` to `expectedHarvestDate`) without adding redundant `crop_name` or `actual_end_date` columns.
  - Add Drizzle `check("seasons_date_range_valid_chk", sql\`${table.startDate} <= ${table.expectedHarvestDate}\`)`to`seasons` via a forward-only migration per ADR-0005.
  - Enforce strict calendar date `YYYY-MM-DD` strings (`zIsoDate()`) at the DTO boundary for both `startDate` and `expectedHarvestDate` rather than ISO `datetime` strings, preventing `+07:00` / UTC off-by-one-day shifts.
- **Single `active` season per plot & `plots -> seasons` lock order**:
  - Enforce at most one `active` season per `plot_id` at the database level via partial unique index `seasons_one_active_per_plot_uidx` (`ON seasons (plot_id) WHERE status = 'active'`), while permitting multiple `planning` drafts and unlimited historical `harvested`/`completed` seasons per plot.
  - Every `POST /api/v1/seasons` and `PATCH /api/v1/seasons/:id` that associates or changes `plotId`, or transitions a season to `active`, locks the referenced live `plots` row(s) (`WHERE id = :plotId AND deleted_at IS NULL FOR UPDATE`, sorted ascending by UUID when locking both old and new plots) before reading or mutating `seasons`, preserving the `plots -> seasons` lock hierarchy established in ADR-0021.
  - Reads (`GET /api/v1/seasons` and `GET /api/v1/seasons/:id`) always include a closed `plot` summary projection (`id`, `plotCode`, `name`, `areaSqm`, `deletedAt`) even when the referenced plot was soft-deleted after a season reached `harvested` or `completed`.
- **Linear state machine & phase-scoped field mutability**:
  - Enforce strictly linear transitions in `SeasonsService`: `planning -> active -> harvested -> completed`, rejecting any skipped or reversed transition with `422 SEASON_INVALID_STATUS_TRANSITION`. Same-status `PATCH` payloads are treated as no-op transitions only in `planning` and `active` when accompanied by valid mutable fields.
  - Scope field mutability by current persisted status: `planning` allows `seasonName`, `plotId`, `startDate`, `expectedHarvestDate`, and transition to `active`; `active` allows only `seasonName`, `expectedHarvestDate`, and transition to `harvested` (`plotId` and `startDate` are locked); `harvested` allows only transition to `completed`; `completed` is terminal and rejects all `PATCH` mutations with `422`.
  - Keep `active -> harvested` independent of `batches` so batch intake (`#82`) remains decoupled from season lifecycle (#79).
- **Comprehensive `409` delete guard over `ON DELETE CASCADE`**:
  - Inside `DELETE /api/v1/seasons/:id`, lock the target `seasons` row (`FOR UPDATE`), verify `status === 'planning'`, zero linked `batches`, and zero linked `farming_logs` before issuing `DELETE`. Missing `:id` returns `404 SEASON_NOT_FOUND`; any non-`planning` status or existing batch/log dependency rolls back and returns `409 SEASON_NOT_DELETABLE`, preventing `ON DELETE CASCADE` from triggering `403 FARMING_LOG_IMMUTABLE`.

## Positive Consequences

- Existing seeders, `SF-03` traceability views, and Drizzle schemas remain aligned without an expand-and-contract column migration.
- Concurrent requests cannot activate two overlapping cultivation seasons on the same plot, attach a season to a soft-deleted plot, or deadlock against `DELETE /api/v1/plots/:id`.
- Calendar dates remain immune to timezone day-boundary drift between client pickers and PostgreSQL `date` columns.
- Deleting a `planning` season with pre-activation logs fails deterministically with `409` rather than leaking a misleading `403` from the append-only `farming_logs` trigger.

## Negative Consequences / Risks

- Staff cannot backfill a `cropName` separation column for crop-level analytics without a future schema migration; `seasonName` carries the crop label until analytics is scoped.
- Allowing multiple `planning` drafts per plot means two draft plans can share overlapping projected dates until one transitions to `active`.
- Because `completed` is strictly terminal and `plotId`/`startDate` lock once `active`, correcting a wrong plot after activation requires finishing or creating a new season rather than editing in place.

## Explicit Tradeoffs

- **Partial unique index (`WHERE status = 'active'`) over `EXCLUDE USING gist` date-range exclusion**: prevents concurrent active cultivation on a plot without blocking forward planning drafts whose projected dates overlap an ongoing harvest.
- **Pre-delete `batches` + `farming_logs` `409` guard over disabling logs during `planning`**: protects `DELETE /seasons/:id` from triggering `403 FARMING_LOG_IMMUTABLE` while keeping `#20` free to record pre-activation `soil_testing` logs if desired.
- **Phase-scoped field mutability over full post-creation immutability**: preserves plot and start-date traceability after cultivation starts while letting staff adjust `seasonName` and `expectedHarvestDate` during `active` growth.
- **Preserving `seasonName` + `expectedHarvestDate` over adding `cropName` / `endDate`**: avoids schema churn for an explicit non-goal (`#79` excludes season analytics) and keeps `SF-03` contracts consistent.
