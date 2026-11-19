---
status: Accepted
date: 2026-11-19
deciders: ngxccc
---

# 18. Address Coordinate Trust and Delivery Fee Integrity

## Context

`user_addresses` stores a free-text `district` alongside client-supplied `latitude` and `longitude`. Delivery fees are computed from those coordinates with `estimateDeliveryQuote()`. Any client that posts a fabricated coordinate can therefore buy a cheaper delivery fee or appear inside the `MAX_RADIUS_KM = 25` deliverability radius. The address book also allows unlimited rows and has no constraint preventing two default addresses.

`HCMC_DISTRICTS` in `@greenroots/shared` already holds the 24 district codes, display names, and centroid coordinates used by the quote function, so the server has a trustworthy geographic source without a geocoding provider.

- **Target modules**: `apps/api/src/modules/users`, `packages/shared`
- **Issue**: #76 (split from #18)
- **Spec Reference**: `docs/design/address-book-and-delivery-fee-formal-spec.md`
- **Related**: `estimateDeliveryQuote`, `HCMC_DISTRICTS`, `BUSINESS_RULES.SHIPPING`

## Decision

- Make `districtCode` the only geographic input. `AddressService` validates `districtCode` against `HCMC_DISTRICTS` and rejects unknown codes with `422 DISTRICT_CODE_INVALID`; `city` is fixed server-side to `TP. Hồ Chí Minh` and `district` is populated from the matched entry's display name.
- Never accept `latitude`, `longitude`, `city`, or unknown fields from a client (`400 UNRECOGNIZED_KEYS`).
- Derive coordinates server-side from the district centroid and store them as an internal cache recomputed whenever `districtCode` changes. Customer address API responses (`AddressDto`) omit `latitude` and `longitude`; the cache is never authoritative for fee decisions.
- Cap each user at 10 addresses (`INV-ADDR-3`). An eleventh create returns `422 ADDRESS_LIMIT_REACHED` and inserts nothing.
- Enforce `INV-ADDR-2` with a unique partial index on `(user_id) WHERE is_default`. Serialize address mutations per user under `READ COMMITTED` by locking the live parent `users` row (`WHERE id = :userId AND deleted_at IS NULL FOR UPDATE`) before counting, inserting, deleting, or switching defaults (`users -> user_addresses` lock order). A missing or soft-deleted user yields `401 AUTH_TOKEN_INVALID_OR_EXPIRED`.
- Keep default switching exclusively on `PATCH /api/v1/users/me/addresses/:id/default`; forbid `isDefault` on `PATCH /api/v1/users/me/addresses/:id` (`400 UNRECOGNIZED_KEYS`). The first address is created as default.
- Hard-delete addresses via `DELETE /api/v1/users/me/addresses/:id` returning `204 No Content`. When the default address is deleted, promote the most recently created remaining address in the same transaction. `orders.shippingAddress` and subscription snapshots are immutable text, so history survives.
- Validate `:id` path parameters as UUIDv7 (`400 INVALID_UUID`), restrict address book endpoints strictly to `UserRole.CUSTOMER` (`@ApiAuth(UserRole.CUSTOMER)` -> `403 FORBIDDEN` for staff/guest roles), and scope every address query by JWT `sub`, returning `404 ADDRESS_NOT_FOUND` for missing or foreign addresses so IDs cannot be enumerated.
- Ship one forward-only migration per `docs/standards/database-and-migrations.md` §5 that adds `district_code` (nullable first), backfills the seeded `district = "Quận 7"` row to `quan-7` and its centroid coordinates, enforces `NOT NULL`, drops the non-unique `user_addresses_default_idx`, and creates the unique partial index `user_addresses_default_uidx`.

## Positive Consequences

- `INV-ADDR-1` holds: the fee surface can only see coordinates the server derived from a validated district.
- Locking the parent `users` row eliminates phantom-insert cap races (`INV-ADDR-3`) and concurrent default `23505` collisions (`INV-ADDR-2`) without `SERIALIZABLE` retries.
- One default per user is a database guarantee, not a service convention.
- The address cap bounds response size and abuse, while omitting coordinates from `AddressDto` prevents clients from treating cached coordinates as an authority.
- Historical orders keep their own snapshot and are unaffected by address deletion.

## Negative Consequences / Risks

- District centroids approximate a real address, so fees are district-level rather than street-level.
- A user whose address lies near a district boundary may receive a slightly wrong distance.
- Locking the `users` row serializes concurrent address mutations for the same account; any future module locking both tables must preserve the `users -> user_addresses` lock order to prevent deadlocks.
- Adding a district requires updating `HCMC_DISTRICTS`.

## Explicit Tradeoffs

- **District centroid over geocoding**: no third-party dependency or API cost wins over street-level accuracy.
- **Hard delete over soft delete**: `user_addresses` stays out of the ADR-0003 soft-delete list and history is preserved by snapshots.
- **Server-derived coordinates over client-supplied (and hidden from `AddressDto`)**: fee integrity wins over map-picker precision.
- **Parent `users` `FOR UPDATE` lock under `READ COMMITTED` over `SERIALIZABLE` retry loops**: eliminates phantom-insert cap races and `23505` collisions cleanly at the cost of per-user write serialization on a <=10-row resource.
- **Dedicated `/default` endpoint + `204` on `DELETE` over overloading `PATCH /:id` and `200` delete envelopes**: prevents `isDefault: false` invalid states at the DTO boundary and complies with API status-code standards.
