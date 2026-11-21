---
status: Accepted
date: 2026-11-21
deciders: ngxccc
---

# 34. Required Shipping Radii, DTO Cross-Field Invariants, and Domain Validation Codes

## Context

Issue `#106` (parent epic `#8`; related `#78`, `#43`, `#25`, `ADR-0021`, `ADR-0030`) requires `PATCH /api/v1/farms/settings` to reject invalid `shippingConfig` radius combinations at the DTO boundary and `seedTier1Reference` to populate `maxRadiusKm` and `subscriptionFreeRadiusKm` on the singleton `farms` row. Reconciling `#106` against the codebase surfaced four architectural tensions:

1. **Stateless DTO boundary vs. omitted optional radii and wholesale `shippingConfig` replacement**: `updateFarmShippingConfigSchema` in `apps/api/src/modules/farms/dto/update-farm-settings.dto.ts` runs inside `ZodValidationPipe` without database access, while `FarmSettingsService.updateSettings` overwrites `farms.shippingConfig` wholesale (no nested merge per `#106` non-goals). Meanwhile, `maxRadiusKm` and `subscriptionFreeRadiusKm` are currently optional on both `FarmShippingConfig` (`ADR-0021`) and `updateFarmShippingConfigSchema`, and `ShippingService.quoteForCoordinates` (`ADR-0030`) falls back to `BUSINESS_RULES.SHIPPING` (`25 km` / `20 km`) when either is omitted. Validating cross-field radius rules _"only when `maxRadiusKm` is provided"_ leaves silent bypasses whenever `maxRadiusKm` or `subscriptionFreeRadiusKm` is omitted (`freeKmThreshold: 30` with omitted `maxRadiusKm` falls back to `25 km`; `maxRadiusKm: 10` with omitted `subscriptionFreeRadiusKm` falls back to `20 km`).
2. **Read/write contract symmetry vs. unseeded pre-launch rows**: `seedTier1Reference` (`apps/api/src/database/seeds/tiers/tier1-reference.seeder.ts`) and `createFarm` (`apps/api/test/factories/farm.factory.ts`) omit `maxRadiusKm` and `subscriptionFreeRadiusKm`, and `farmShippingConfigSchema` (`farm-settings.dto.ts`) keeps them optional. Leaving `FarmShippingConfig` optional on reads while making `updateFarmShippingConfigSchema` required on writes forces Backoffice (`#43` BO-10) and `ShippingService` to carry fallback logic indefinitely for legacy 4-key rows.
3. **Database `CHECK` constraints (`ADR-0005`) vs. `INV-SHIP-3` defense-in-depth verification**: `apps/api/test/integration/shipping.spec.ts` currently exercises `INV-SHIP-3` (proving `calculateDeliveryQuote()` evaluates `maxRadiusKm` before `subscriptionFreeRadiusKm` even under misconfigured persistence) by calling `PATCH /api/v1/farms/settings` with `{ maxRadiusKm: 25, subscriptionFreeRadiusKm: 150 }`. Blocking `subscriptionFreeRadiusKm > maxRadiusKm` at the `PATCH` DTO boundary breaks that test setup, and adding a PostgreSQL `CHECK` inequality constraint on `farms.shipping_config` would additionally block seeding a misconfigured row directly in Drizzle for E2E verification.
4. **Domain-specific error codes in `ZodValidationPipe` vs. RFC 9457 `reason` hygiene**: `ZodValidationPipe` (`apps/api/src/common/pipes/zod-validation.pipe.ts`) checks whether a custom Zod issue message matches `API_ERROR_CODES`, and if so copies `issue.message` verbatim into both `invalidParams[].code` and `invalidParams[].reason` — leaking an uppercase machine code into `reason` instead of a developer-facing English sentence per `docs/standards/api-design-and-error-handling.md` §4. Meanwhile, `API_ERROR_CODES` lacks dedicated codes for shipping radius cross-field violations so clients (`#43`) can display field-accurate Vietnamese copy.

- **Target modules**: `packages/shared`, `apps/api/src/common/pipes`, `apps/api/src/common/constants`, `apps/api/src/database/schemas`, `apps/api/src/database/migrations`, `apps/api/src/database/seeds`, `apps/api/src/modules/farms`, `apps/api/src/modules/orders/shipping`, `apps/backoffice` / `apps/storefront` (type sync)
- **Issue**: `#106` (parent epic `#8`); related `#78`, `#43`, `#25`
- **Spec**: `docs/design/farm-settings-and-plots-formal-spec.md` (`v1.1.0`)
- **Related**: `ADR-0005`, `ADR-0007`, `ADR-0011`, `ADR-0013`, `ADR-0021` (partially superseded on `FarmShippingConfig` optionality), `ADR-0030` (partially superseded on `ShippingService` optional-radius fallback)

## Decision

- **Require `maxRadiusKm` and `subscriptionFreeRadiusKm` across `FarmShippingConfig` and Farm Settings DTOs (partially superseding `ADR-0021` and `ADR-0030`)**:
  - Change `maxRadiusKm: number` and `subscriptionFreeRadiusKm: number` from optional to required in `FarmShippingConfig` (`packages/shared/src/jsonb-contracts.type.ts`), `farmShippingConfigSchema` (`apps/api/src/modules/farms/dto/farm-settings.dto.ts`), and `updateFarmShippingConfigSchema` (`apps/api/src/modules/farms/dto/update-farm-settings.dto.ts`), validated as `z.number().positive()` with no artificial upper cap.
  - Because `FarmSettingsService.readFromCache()` parses cached Redis payloads with `farmSettingsSchema.safeParse()`, any stale 4-key JSON cached under `farm:settings:v1` self-heals by failing schema validation and falling back to PostgreSQL.
  - Simplify `ShippingService.quoteForCoordinates()` (`apps/api/src/modules/orders/shipping/shipping.service.ts`) to read `settings.shippingConfig.maxRadiusKm` and `settings.shippingConfig.subscriptionFreeRadiusKm` directly without `?? BUSINESS_RULES.SHIPPING` fallbacks, while preserving `calculateDeliveryQuote()`'s `maxRadiusKm`-first precedence (`ADR-0030` `INV-SHIP-3`) in `packages/shared/src/haversine.ts`.
  - Run `bun run types:sync` so generated OpenAPI and TypeScript client contracts reflect required radius fields on both `FarmSettingsDto` and `UpdateFarmSettingsDto`.
- **Enforce cross-field radius inequalities at the stateless `UpdateFarmSettingsDto` boundary (`400 VALIDATION_FAILED`)**:
  - Add `.superRefine()` on `updateFarmShippingConfigSchema` rejecting `subscriptionFreeRadiusKm > maxRadiusKm` (issue attached at path `["subscriptionFreeRadiusKm"]` → `shippingConfig.subscriptionFreeRadiusKm`) and `freeKmThreshold > maxRadiusKm` (issue attached at path `["freeKmThreshold"]` → `shippingConfig.freeKmThreshold`). Both checks execute independently so a payload violating both reports both `invalidParams` entries.
  - Allow exact boundary equality (`subscriptionFreeRadiusKm === maxRadiusKm` and `freeKmThreshold === maxRadiusKm`) and impose no cross-constraint between `freeKmThreshold` and `subscriptionFreeRadiusKm`.
- **Dedicated `@greenroots/shared` error codes and `ZodValidationPipe` English-reason mapping**:
  - Register `FARM_SHIPPING_SUBSCRIPTION_RADIUS_INVALID` and `FARM_SHIPPING_FREE_THRESHOLD_INVALID` in `API_ERROR_CODES` and `API_ERROR_DICTIONARY` (`packages/shared/src/error-dictionary.ts`) with distinct Vietnamese copy for Backoffice (`#43`).
  - Add corresponding English developer messages in `MESSAGES.VALIDATION` (`apps/api/src/common/constants/messages.constant.ts`) and map explicit `API_ERROR_CODES` Zod issue messages to their English `MESSAGES.VALIDATION` strings via a `VALIDATION_CODE_REASONS` lookup in `ZodValidationPipe` (`apps/api/src/common/pipes/zod-validation.pipe.ts`), ensuring `invalidParams[].code` carries the specific domain error code while `invalidParams[].reason` remains an English sentence per `docs/standards/api-design-and-error-handling.md` §4.
- **Tier 1 seeding, pre-launch backfill migration, and JSONB boundary consistency (`ADR-0005`)**:
  - Update `seedTier1Reference` (`apps/api/src/database/seeds/tiers/tier1-reference.seeder.ts`), `createFarm` (`apps/api/test/factories/farm.factory.ts`), and unit/integration test fixtures (`farm-settings.service.spec.ts`, `orders.service.spec.ts`, `shipping.service.spec.ts`, `farms.spec.ts`) to include `maxRadiusKm` and `subscriptionFreeRadiusKm`.
  - Generate one forward-only custom SQL migration (`docs/standards/database-and-migrations.md` §5) backfilling missing or null `maxRadiusKm` (`25`) and `subscriptionFreeRadiusKm` (`20`) keys in existing `farms.shipping_config` rows while preserving existing non-null keys.
  - Intentionally omit PostgreSQL `CHECK` constraints on `farms.shipping_config` JSONB sub-keys (consistent with `flashSaleConfig`, `hotlines`, `soilTestResult`, and `waterTestResult`, which validate at the Zod DTO boundary rather than via brittle SQL JSONB type-casts), while keeping `apps/api/test/integration/shipping.spec.ts` free to seed a misconfigured row directly via Drizzle to verify `INV-SHIP-3` defense-in-depth at the HTTP `/shipping/quote` boundary.

## Positive Consequences

- Eliminates silent configuration drift and omitted-field bypasses on `PATCH /api/v1/farms/settings`: every persisted and transmitted `FarmShippingConfig` carries explicit, positive `maxRadiusKm` and `subscriptionFreeRadiusKm` values.
- Gives Backoffice (`#43` BO-10) a symmetric OpenAPI contract (`GET` and `PATCH` both expose non-optional radius numbers) and field-specific RFC 9457 `invalidParams` codes with localized Vietnamese copy.
- Fixes `ZodValidationPipe`'s `reason` leakage for any DTO emitting explicit `API_ERROR_CODES` while preserving top-level HTTP `400 VALIDATION_FAILED`.
- Preserves end-to-end testability of `INV-SHIP-3` (`maxRadiusKm`-first precedence in `calculateDeliveryQuote()`) without weakening API write validation.

## Negative Consequences / Risks

- **Breaking OpenAPI and `@greenroots/shared` contract change**: Existing callers or tests omitting `maxRadiusKm` or `subscriptionFreeRadiusKm` in `PATCH /api/v1/farms/settings` (such as `farms.spec.ts` negative-`baseFeeVnd` test) or constructing partial `FarmShippingConfig` fixtures (`shipping.service.spec.ts`, `orders.service.spec.ts`, `farm-settings.service.spec.ts`) must be updated alongside `bun run types:sync`.
- **No DB-level JSONB `CHECK` constraint on `shipping_config`**: Direct SQL writes bypassing `PATCH /api/v1/farms/settings` can still persist `<= 0` radii or `subscriptionFreeRadiusKm > maxRadiusKm` (mitigated for deliverability by `INV-SHIP-3` inside `calculateDeliveryQuote()`, and matching all other JSONB columns in `farms`/`plots`).
- **Pre-launch assumption for backfill migration**: The forward-only backfill migration assumes a singleton/small `farms` table prior to launch and sets default radii (`25 km` / `20 km`) only where keys are absent.

## Explicit Tradeoffs

- **Required `FarmShippingConfig` across read/write + DB backfill over read-optional / write-required asymmetry**: Accepts one forward-only backfill migration and updating pre-launch test mocks now (before production launch and BO-10 `#43` binding) so `FarmShippingConfig` has zero optional-radius ambiguity or `??` fallback divergence across apps.
- **Required DTO fields over keeping optional fields with `BUSINESS_RULES` DTO-boundary defaults**: Accepts a breaking OpenAPI request-body change on `PATCH /api/v1/farms/settings` to prevent callers from silently resetting a customized `maxRadiusKm` back to `25 km` by omitting the field during wholesale `shippingConfig` replacement.
- **Two dedicated `API_ERROR_CODES` + `ZodValidationPipe` reason map over `CUSTOM_VALIDATION_ERROR` or one shared code**: Adds two entries to `@greenroots/shared` and a small lookup table in `ZodValidationPipe` so BO-10 receives distinct Vietnamese messages and `invalidParams[].reason` stays compliant with `api-design-and-error-handling.md` §4.
- **DTO-only JSONB validation + clean backfill migration over SQL JSONB `CHECK` constraints**: Keeps `migration.sql` concise and consistent with `flashSaleConfig` and `soilTestResult`/`waterTestResult` (avoiding brittle SQL `CASE`/`jsonb_typeof` casts across partial JSONB keys), while keeping `INV-SHIP-3` integration tests (`shipping.spec.ts`) executable against PostgreSQL.
