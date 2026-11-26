---
status: Accepted
date: 2026-11-26
deciders: ngxccc
---

# 44. Goong Place Geocoding and Road-Distance Shipping

## Context

`ADR-0018` made `districtCode` (`HCMC_DISTRICTS` centroids) the sole geographic input for `user_addresses`, and `ADR-0030` wired `ShippingService` to `HaversineShippingDriver` using `addressId` XOR `districtCode`. Because `HCMC_DISTRICTS` models each district as a single centroid point, large districts such as TP. Thủ Đức and Bình Chánh suffer 10–15 km distance drift, and addresses in Bình Thạnh resolve to 0 km against the Bình Thạnh fulfillment hub.

- **Target modules**: `apps/api/src/modules/geocoding`, `apps/api/src/modules/users`, `apps/api/src/modules/orders/shipping`, `apps/api/src/modules/orders`, `apps/storefront`, `packages/shared`
- **Issues**: #107, #199
- **Spec Reference**: `docs/design/goong-place-geocoding-and-road-shipping-formal-spec.md`
- **Related**: Amends `ADR-0018` and `ADR-0030`

## Decision

- **Breaking removal of `districtCode` in favor of `placeId`**:
  - Remove `district_code` from `user_addresses` and remove `districtCode` from `AddressDto`, `CreateAddressDto`, `UpdateAddressDto`, `ShippingQuoteRequestDto` (`addressId` XOR `placeId`), `ValidateCartDto`, and `apps/storefront` (`HcmcDistrictSelect` and guest district picker).
  - Add `place_id` (`varchar(255) NOT NULL`) to `user_addresses` and make `latitude`/`longitude` `NOT NULL`, while keeping `district` (`varchar(100) NOT NULL`) populated server-side from Goong `compound.district` for operational grouping.
- **Server-side `GeocodingDriver` seam (`GEOCODING_DRIVER=goong|vietmap|mock`)**:
  - Client payloads MUST NEVER supply `latitude` or `longitude` (`INV-ADDR-1` preserved from `ADR-0018`).
  - `GoongGeocodingDriver` and `VietmapGeocodingDriver` (Vietmap Maps API v4 `/api/autocomplete/v4` + `/api/place/v4` via `VIETMAP_API_KEY`) expose `GET /api/v1/geocoding/autocomplete` behind `@ApiAuth(UserRole.CUSTOMER)` and strict throttling, and resolve `placeId` server-side with Redis caching (24h autocomplete, 14d place detail).
  - `MockGeocodingDriver` resolves a deterministic `MOCK_PLACES` table for offline development and E2E suites.
- **Asymmetric resilience (`GoongShippingDriver` fallback vs. `GeocodingService` fail-closed)**:
  - `GoongShippingDriver` (`SHIPPING_DRIVER=goong`) computes real road distances via Goong Distance Matrix (`vehicle=bike`), caches results in Redis keyed by `farm_ver` and coordinates (24h TTL), and automatically falls back to `HaversineShippingDriver` on timeout (>3000ms), `429`, or `5xx` so checkout never fails due to routing outages.
  - `GeocodingService.resolvePlace()` fails closed with `503 GEOCODING_UNAVAILABLE` if Goong Place Detail fails for an uncached `placeId`, preventing null-coordinate address rows.
- **Authenticated-only Goong access**: Unauthenticated guests on `apps/storefront` see general delivery radius and base fee policy and must sign in to search addresses or request exact quotes.

## Positive Consequences

- Eliminates 10–15 km district-centroid pricing drift and the Bình Thạnh 0 km blind spot while keeping `INV-ADDR-1` intact (no client-supplied `latitude`/`longitude`).
- Retains 100% deterministic offline dev and E2E testing via `GEOCODING_DRIVER=mock` and `SHIPPING_DRIVER=haversine`.
- Protects checkout availability during Goong Distance Matrix outages via `HaversineShippingDriver` fallback on street-accurate saved coordinates.
- Prevents anonymous Goong API quota drain by gating autocomplete and quotes behind `UserRole.CUSTOMER`.

## Negative Consequences / Risks

- Breaking change across DB schema, API DTOs, generated OpenAPI clients, storefront UI, and existing `districtCode` tests.
- New customers cannot create an uncached address if Goong Place API is down or quota-exhausted (`503 GEOCODING_UNAVAILABLE`), though customers with saved addresses can still check out.
- Deep alleys missing from Goong Place Autocomplete resolve to the nearest street/alley entrance until `streetAddress` is read by the courier.

## Explicit Tradeoffs

- **Remove `districtCode` cleanly over maintaining dual `placeId | districtCode` paths**: avoids duplicated UI, validation, and test matrices at the cost of a coordinated migration and test update.
- **Autocomplete `placeId` over free map-pin `lat/lng`**: preserves `INV-ADDR-1` fee integrity and avoids heavy map SDK integration at the cost of minor alley-entrance approximation.
- **Authenticated-only autocomplete over guest proxy**: eliminates unauthenticated Goong billing/quota abuse at the cost of requiring login before exact shipping quotes.
- **Haversine fallback on Distance Matrix vs. fail-closed on Place Detail**: keeps checkout resilient on saved coordinates while guaranteeing no address is persisted without verified coordinates.
