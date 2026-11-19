---
status: Accepted
date: 2026-11-19
deciders: ngxccc
---

# 21. Farm Settings Cache Consistency, Cloudinary Boundary, and Plot Lifecycle

## Context

Issue #78 (split from #19; Backoffice consumer #43) introduces the first endpoints in `apps/api/src/modules/farms`: `GET`/`PATCH /api/v1/farms/settings` and `GET`/`POST`/`PATCH`/`DELETE /api/v1/plots`. Designing those endpoints against the existing schema and ADRs surfaced four structural tensions that cannot be solved cleanly by convention alone:

1. **Singleton `farms` vs. hardcoded `BUSINESS_RULES`**: The `farms` table already stores `latitude`, `longitude`, `shippingConfig`, and `flashSaleConfig`, yet `estimateDeliveryQuote()` and `BUSINESS_RULES` in `packages/shared` still hardcode static farm coordinates and shipping/flash-sale constants (and `FarmShippingConfig` omits `maxRadiusKm` and `subscriptionFreeRadiusKm`). Allowing `PATCH /farms/settings` without clarifying the authority boundary creates silent configuration drift.
2. **24-hour Redis cache invalidation race and failure mode**: Backoffice reads farm settings on nearly every screen via a 24-hour Redis cache, while writes must invalidate it. A naive cache-aside `GET` + `DEL` suffers from a stale-write race (`GET` miss reads old row -> `PATCH` commits and deletes cache -> `GET` writes old row into Redis for 24h) and raises a failure-policy fork when Redis is unreachable during `PATCH`.
3. **Cloudinary media boundary vs. plot/farm certificates**: `plots` uses structured `SoilTestResult` and `WaterTestResult` JSONB payloads with optional `certificate_url` (and `farms` has `certificationUrl`). However, `ALLOWED_MEDIA_FOLDERS` in `apps/api/src/modules/media/media.interface.ts` and ADR-0009 lack `plots` and `farms` folders, and `MEDIA_CONSTRAINTS` prohibits PDFs (`raw` uploads), whereas the seeders previously used `greenroots.farm/*.pdf` placeholders.
4. **Soft-delete bypass on `plots` vs. `seasons`**: `plots` is soft-deletable (ADR-0003), while `seasons.plotId` relies on `ON DELETE RESTRICT`. Because soft delete issues an `UPDATE` rather than a `DELETE`, PostgreSQL will not block soft-deleting a plot that still owns active or planned seasons.

- **Target modules**: `apps/api/src/modules/farms`, `apps/api/src/modules/media`, `apps/api/src/database/schemas`, `apps/api/src/database/seeds`, `packages/shared`
- **Issue**: #78 (split from #19); backoffice consumer: #43
- **Spec**: `docs/design/farm-settings-and-plots-formal-spec.md`
- **Related**: ADR-0003, ADR-0004, ADR-0005, ADR-0009, ADR-0018, ADR-0019

## Decision

- **Singleton `farms` authority & payment invariant**:
  - Treat `farms` as a single-farm singleton addressed without `:farmId` on `/api/v1/farms/settings`. If the `farms` table has zero rows (unseeded environment), `GET` and `PATCH` fail explicitly with `404 FARM_NOT_FOUND` rather than auto-inserting a partial row.
  - Extend `FarmShippingConfig` in `packages/shared/src/jsonb-contracts.type.ts` with optional `maxRadiusKm` and `subscriptionFreeRadiusKm` (defaulting to `BUSINESS_RULES.SHIPPING` constants when omitted) and designate `FarmSettingsService` as the dynamic runtime source for backend consumers, with `BUSINESS_RULES` serving as the initial seed and fallback baseline.
  - Enforce that at least one checkout payment method remains enabled (`isPayosEnabled || isCodEnabled === true`); rejecting updates that disable both with `422 FARM_PAYMENT_METHOD_REQUIRED`.
- **24-hour Redis Cache-Aside with `UNLINK` and Lua stale-write guard**:
  - Cache the serialized `FarmSettingsDto` projection under key `farm:settings:v1` with an 86,400-second (24h) TTL.
  - `GET /api/v1/farms/settings` reads Redis first; on a miss or Redis error, it fails open to PostgreSQL. Before backfilling Redis, `GET` captures a timestamp prior to the DB query and executes an atomic Lua `SET` that writes `farm:settings:v1` only if the key is absent (`NX`) and no newer `farm:settings:invalidated_at` marker exists.
  - On `PATCH /api/v1/farms/settings`, after PostgreSQL commits the transaction, the service pipelines `UNLINK farm:settings:v1` and `SET farm:settings:invalidated_at <nowMs> EX 60`. If Redis is unreachable during invalidation, the error is logged for ops alerting and the API returns `200` with the committed PostgreSQL row rather than returning a misleading `503` after commit.
- **Amend ADR-0009 for `plots` / `farms` image-only Cloudinary URLs**:
  - Add `"plots"` (permitted for `farm_staff`, `admin`, `super_admin`) and `"farms"` (permitted for `admin`, `super_admin`) to `ALLOWED_MEDIA_FOLDERS` and `FOLDER_PERMISSIONS` in `apps/api/src/modules/media/media.interface.ts`.
  - Retain `MEDIA_CONSTRAINTS` as **image/video only** (image ≤ 5 MB JPEG/PNG/WebP; no `raw`/PDF uploads via `#16`).
  - Enforce at the DTO/service boundary that `farms.certificationUrl`, `plots.soilTestResult.certificate_url`, and `plots.waterTestResult.certificate_url` (when non-null) are valid HTTPS URLs scoped to the configured Cloudinary image delivery origin (`https://res.cloudinary.com/<cloudName>/image/upload/...`, using the configured `CLOUDINARY_CLOUD_NAME` or development default `"greenroots-dev"`). Update Tier 1 and Tier 2 seeder placeholder URLs to conform.
- **Structured `plots` contract & active-season soft-delete guard**:
  - Preserve `plots.plotCode`, `areaSqm` (enforced with a Drizzle `check("plots_area_sqm_positive_chk", sql\`${table.areaSqm} > 0\`)`), and structured JSONB `soilTestResult`/`waterTestResult`payloads rather than adding flat URL columns. Allow`PATCH`to edit`plotCode`(subject to`plots_plot_code_uidx`->`409 PLOT_CODE_ALREADY_EXISTS`) and clear `soilTestResult`/`waterTestResult`via explicit`null`.
  - Allow `GET /api/v1/plots` and `GET /api/v1/plots/:id` for all `STAFF_ROLES` (`farm_staff`, `sales`, `admin`, `super_admin`); restrict `POST`/`PATCH` to `farm_staff`, `admin`, `super_admin`; and restrict `DELETE` to `admin`, `super_admin`.
  - Inside `DELETE /api/v1/plots/:id`, lock the target live plot row (`WHERE id = :id AND deleted_at IS NULL FOR UPDATE`) and verify zero linked `seasons` exist with `status IN ('planning', 'active')` before setting `deletedAt = NOW()`. If any active or planning season exists, roll back and return `409 PLOT_HAS_ACTIVE_SEASONS`.

## Positive Consequences

- Concurrent `GET` misses can no longer pin stale farm settings in Redis for 24 hours across a `PATCH` invalidation.
- Farm shipping and flash-sale settings have an unambiguous ownership contract without breaking offline `BUSINESS_RULES` defaults.
- Certificate URLs cannot be spoofed to arbitrary third-party hosts or trigger SSRF/unexpected MIME rendering, while avoiding Cloudinary free-tier PDF delivery blocks and `raw` signature hardening.
- Soft-deleting a plot cannot orphan an in-flight or planned cultivation season.

## Negative Consequences / Risks

- If Redis suffers a brief write-only failure precisely during `PATCH` invalidation and immediately recovers without flushing, stale settings could persist up to the 24-hour TTL unless operators act on the logged invalidation error.
- Laboratory certificates must be uploaded as images (JPG/PNG/WebP ≤ 5 MB) rather than raw PDF files until a future ADR hardens `allowed_formats` signing and PDF delivery policy.
- Storefront static helpers (`estimateDeliveryQuote()`) will continue using `BUSINESS_RULES` defaults until a public delivery-quote/config endpoint is introduced.

## Explicit Tradeoffs

- **`UNLINK` + `invalidated_at` Lua guard with post-commit log-on-error over fail-closed `503` invalidation**: prevents false-failure `503` responses after a committed PostgreSQL write, at the cost of a narrow Redis-flap stale window.
- **Image-only Cloudinary uploads over `raw` PDF support**: preserves the existing `#16` HMAC signature contract (`folder` + `timestamp`) and avoids Cloudinary PDF delivery blocks, at the cost of requiring image exports/scans of lab certificates.
- **Keeping structured `SoilTestResult` / `WaterTestResult` JSONB over flat URL columns**: avoids schema churn, aligns with existing seeders and BO-01 UI plans, and preserves typed lab telemetry alongside optional `certificate_url`.
- **Explicit `planning`/`active` season check under `FOR UPDATE` over unconditional soft delete**: protects cultivation workflow integrity (`#19`) that PostgreSQL `ON DELETE RESTRICT` cannot enforce on soft deletes.
