---
status: Accepted
date: 2026-11-21
deciders: ngxccc
---

# 30. Shipping Driver Seam and Quote Boundary

## Context

Issue #25 introduces the shipping calculation abstraction and `POST /api/v1/shipping/quote` endpoint under `apps/api/src/modules/orders/shipping/*`, consumed by storefront address selection and checkout (`#49`), retail COD checkout (`#84`), subscription creation (`#30`), and the 04:00 subscription auto-order cron (`#31`). Implementing #25 against the existing codebase surfaced five architectural tensions:

1. **Static `BUSINESS_RULES` vs. dynamic `FarmSettings` (ADR-0021)**: `estimateDeliveryQuote()` in `packages/shared/src/haversine.ts` hardcodes `BUSINESS_RULES.FULFILLMENT_HUB` (originally `FARM_COORDINATES`) and `BUSINESS_RULES.SHIPPING` (`25 km`, `1.30`, `20 km`), while ADR-0021 designates `FarmSettingsService` (`farms` table + 24h Redis cache) as the runtime SSOT for hub dispatch coordinates and `shippingConfig`. Meanwhile, `apps/storefront` (`header.tsx`, `address-dialog.tsx`) imports that static helper directly until `#49` migrates it to the quote API.
2. **Coordinate trust boundary vs. pre-save address quoting (ADR-0018)**: ADR-0018 forbids accepting client `latitude`/`longitude` for fee calculation. However, `#49` needs quotes both for saved addresses (`addressId`) and inside the address creation/selection dialog before an address row exists (`districtCode` only).
3. **Subscription rule contradiction beyond 20 km**: `estimateDeliveryQuote()` currently blocks subscription deliveries beyond `SUBSCRIPTION_FREE_RADIUS_KM` (`20 km`) with `isDeliverable: false` and `feeVnd: 0`, whereas `subscriptions.shipping_fee_per_delivery` exists in the schema and `updateFarmShippingConfigSchema` does not cross-validate `subscriptionFreeRadiusKm <= maxRadiusKm`.
4. **Quote endpoint out-of-radius HTTP semantics**: Returning `422 OUT_OF_DELIVERY_RADIUS` from `POST /api/v1/shipping/quote` would withhold `roadDistanceKm` and dynamic radius limits from `#49`, forcing the storefront to duplicate distance math.
5. **Cross-module dependency & interface naming**: `apps/api/src/modules/orders/` does not exist yet, and both `OrdersModule` (`#84`) and `SubscriptionsModule` (`#30`, `#31`) need shipping quotes without creating a module cycle. Additionally, TypeScript conventions avoid `I`-prefixed interfaces (`ShippingDriver` rather than `IShippingDriver`), even though `MailDriver`/`PaymentDriver` in `environment.constant.ts` previously forced `IMailDriver`/`IPaymentDriver`.

- **Target modules**: `apps/api/src/modules/orders/shipping`, `apps/api/src/common/constants/environment.constant.ts`, `packages/shared`
- **Issue**: #25 (parent epic #10); consumers: #49, #84, #30, #31
- **Spec Reference**: `docs/design/shipping-quote-and-driver-formal-spec.md`
- **Related**: ADR-0010, ADR-0011, ADR-0018, ADR-0021, ADR-0034 (partially supersedes optional-radius fallback in `ShippingService` and adds `PATCH /farms/settings` cross-field radius validation)

## Decision

- **Decoupled `ShippingModule` and async `ShippingDriver` seam (no `I` prefix)**:
  - Host the shipping implementation under `apps/api/src/modules/orders/shipping/*` as a standalone `ShippingModule` (importing `FarmsModule` and `UsersModule`, exporting `ShippingService` and `SHIPPING_DRIVER_TOKEN`) so `OrdersModule` and `SubscriptionsModule` can import it independently without circular dependencies.
  - Name the pure computation contract `ShippingDriver` (dropping the `I` prefix from #25's initial title) with an async `calculateQuote(input): Promise<ShippingDriverQuote>` method accepting pure origin coordinates, destination coordinates, resolved shipping configuration, and `{ isSubscription }`. Name the environment driver union `ShippingDriverKind` (`"haversine"`) in `environment.constant.ts` (`SHIPPING_DRIVER`, defaulting to `"haversine"`) to avoid colliding with `ShippingDriver`.
- **Dynamic `FarmSettingsService` authority & shared pure math**:
  - `ShippingService` reads farm origin (`latitude`, `longitude`) and `shippingConfig` (falling back to `BUSINESS_RULES.SHIPPING` only for optional `maxRadiusKm` and `subscriptionFreeRadiusKm` when omitted) from `FarmSettingsService.getSettings()`. If the `farms` table has no rows, `ShippingService` fails closed with `404 FARM_NOT_FOUND`.
  - Replace `estimateDeliveryQuote()` with a single pure, parameter-injected `calculateDeliveryQuote(origin, destination, config, options?)` helper in `packages/shared/src/haversine.ts` (no backward-compatible wrapper), update the two existing `apps/storefront` call sites (`header.tsx`, `address-dialog.tsx`) to pass `BUSINESS_RULES` explicitly until `#49` migrates them to the API, and implement `HaversineShippingDriver` on top of `calculateDeliveryQuote()` so backend and shared math never drift.
- **Subscription `(20 km, 25 km]` paid tier & radius-first precedence**:
  - Update `calculateDeliveryQuote()` (and `haversine.spec.ts`) so `maxRadiusKm` is always evaluated first as the hard deliverability ceiling (`isDeliverable = roadDistanceKm <= maxRadiusKm`).
  - When `isDeliverable` is `false`, return `feeVnd: null` and `isFreeShipping: false`.
  - When `isDeliverable` is `true`, if `isSubscription && roadDistanceKm <= subscriptionFreeRadiusKm`, return `feeVnd: 0` and `isFreeShipping: true`; otherwise (including subscription deliveries between `subscriptionFreeRadiusKm` and `maxRadiusKm`) compute `baseFeeVnd + Math.max(0, Math.ceil(roadDistanceKm - freeKmThreshold)) * perKmRateVnd` with `isFreeShipping: false`.
- **Authenticated XOR quote endpoint with `200` undeliverable projection**:
  - Expose `POST /api/v1/shipping/quote` behind `@ApiAuth(UserRole.CUSTOMER)` and the `default` throttler (`100 req / 60s`), using `@HttpCode(HttpStatus.OK)`.
  - Enforce a strict XOR input contract: either `addressId` (UUIDv7) or `districtCode` (non-empty string), plus optional `isSubscription` (`false` default). Reject requests supplying both, neither, or any coordinate/unknown fields (`latitude`, `longitude`, `city`) with `400`.
  - Resolve `{ addressId }` via `AddressService.resolveAddressForQuote(sub, addressId)` (enforcing `users.deletedAt IS NULL` -> `401` and `userId = sub` ownership -> `404 ADDRESS_NOT_FOUND`). Resolve `{ districtCode }` via `findHcmcDistrictByCode(districtCode)` (`422 DISTRICT_CODE_INVALID` when unknown) without an extra `users` query beyond `JwtAuthGuard` + Redis revocation.
  - Return `200 OK` even when `isDeliverable: false`, exposing `{ straightLineKm, roadDistanceKm, feeVnd, isDeliverable, isFreeShipping, maxRadiusKm, subscriptionFreeRadiusKm }` while omitting all farm and district coordinates. Hard `422 OUT_OF_DELIVERY_RADIUS` enforcement remains the responsibility of checkout (`#84`) and subscription creation (`#30`).
- **Dynamic error copy hygiene**:
  - Remove the hardcoded `25 km` interpolation from `API_ERROR_DICTIONARY.OUT_OF_DELIVERY_RADIUS` in `packages/shared/src/error-dictionary.ts` so client error messages never contradict customized `FarmSettings.shippingConfig.maxRadiusKm` values.

## Positive Consequences

- `OrdersModule` (`#84`) and `SubscriptionsModule` (`#30`, `#31`) share one authoritative quote service and driver token with zero circular dependency risk.
- Backoffice edits to farm coordinates or `shippingConfig` take effect immediately for all quotes without stale `25 km` error copy or silent `BUSINESS_RULES` overrides.
- `feeVnd: null` when `isDeliverable: false` eliminates UI ambiguity between free shipping (`0 VND`) and out-of-radius rejection while still giving `#49` exact `roadDistanceKm` and `maxRadiusKm` feedback.
- `HaversineShippingDriver` and `apps/storefront` share one pure `calculateDeliveryQuote()` Haversine + two-step rounding formula in `@greenroots/shared` with no legacy wrapper.
- Evaluating `maxRadiusKm` before `subscriptionFreeRadiusKm` prevents misconfigured settings (`subscriptionFreeRadiusKm > maxRadiusKm`) from allowing out-of-radius subscription orders.

## Negative Consequences / Risks

- Subscription deliveries in `(subscriptionFreeRadiusKm, maxRadiusKm]` now incur a positive `feeVnd`, requiring `#30` and `#31` to propagate `shippingFeePerDelivery` accurately into recurring orders and payments.
- Naming the interface `ShippingDriver` instead of `IShippingDriver` diverges slightly from the older `IMailDriver` (`mail.interface.ts`) and requires updating the #25 issue text for clarity.
- Skipping a `users` DB existence check on `{ districtCode }` quotes leaves up to the 15-minute access-token TTL window for a soft-deleted customer (if not explicitly revoked in Redis) to query non-PII district distances; `addressId` quotes and all checkout/subscription mutations still check `users.deletedAt IS NULL`.
- Removing the static `25 km` literal from `API_ERROR_DICTIONARY.OUT_OF_DELIVERY_RADIUS` means `#84` and `#30` should attach `maxRadiusKm` in `invalidParams[].params` if the UI wants the numeric limit inside `422` errors.

## Explicit Tradeoffs

- **Standalone `ShippingModule` under `orders/shipping/` over embedding in `OrdersModule`**: avoids future circular imports with `SubscriptionsModule` while honoring #25's directory scope.
- **`FarmSettingsService` runtime config over static `BUSINESS_RULES`**: preserves ADR-0021 SSOT at the cost of coupling `ShippingModule` to `FarmsModule` and failing closed (`404`) on unseeded databases.
- **Removing `estimateDeliveryQuote()` and updating `apps/storefront` call sites directly over keeping a compatibility wrapper**: avoids carrying a legacy hardcoded helper in `@greenroots/shared` at the cost of updating two call sites in `apps/storefront` (`header.tsx`, `address-dialog.tsx`) before `#49`.
- **Paid `(20 km, 25 km]` subscription tier over hard 20 km block**: aligns with `subscriptions.shipping_fee_per_delivery` and #25's `"free <= 20 km for subscription"` phrasing while preserving `maxRadiusKm` as the single deliverability ceiling.
- **`200 OK` with `feeVnd: null` on `/shipping/quote` over `422 OUT_OF_DELIVERY_RADIUS`**: supports rich distance UX in `#49` while keeping hard `422` enforcement at transactional boundaries (`#84`, `#30`).
- **Standard TypeScript `ShippingDriver` + `ShippingDriverKind` over `IShippingDriver`**: avoids Hungarian notation in the new `orders` domain while preventing collision with environment constants.
