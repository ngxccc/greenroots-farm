---
status: Accepted
date: 2026-11-18
deciders: ngxccc
---

# 18. Address Coordinate Trust and Delivery Fee Integrity

## Context

`user_addresses` stores a free-text `district` alongside client-supplied `latitude` and `longitude`. Delivery fees are computed from those coordinates with `estimateDeliveryQuote()`. Any client that posts a fabricated coordinate can therefore buy a cheaper delivery fee or appear inside the `MAX_RADIUS_KM = 25` deliverability radius. The address book also allows unlimited rows and has no constraint preventing two default addresses.

`HCMC_DISTRICTS` in `@greenroots/shared` already holds the 24 district codes, display names, and centroid coordinates used by the quote function, so the server has a trustworthy geographic source without a geocoding provider.

- **Target modules**: `apps/api/src/modules/users`, `packages/shared`
- **Issue**: #76 (split from #18)
- **Related**: `estimateDeliveryQuote`, `HCMC_DISTRICTS`, `BUSINESS_RULES.SHIPPING`

## Decision

- Make `district_code` the only geographic input. `district_code` must match a code in `HCMC_DISTRICTS`; `city` is fixed to `TP. Hồ Chí Minh`.
- Never accept `latitude` or `longitude` from a client. Request DTOs reject both fields and every unknown field.
- Derive coordinates server-side from the district centroid and store them as a cache that is recomputed whenever `district_code` changes. The cache is never authoritative for fee decisions.
- Reject unknown district codes with `422` and a machine-readable code.
- Cap each user at 10 addresses. A request for an eleventh returns `422 ADDRESS_LIMIT_REACHED` and inserts nothing.
- Enforce `INV-ADDR-2` with a unique partial index on `(user_id) WHERE is_default`. Setting a default unsets the previous default in the same transaction; the first address is created as default.
- When the default address is deleted, promote the most recently created remaining address in the same transaction.
- Return `404` for another user's address on read, update, delete, and default, so ids cannot be enumerated.
- Hard-delete addresses. `orders.shippingAddress` and subscription snapshots are immutable text, so history survives.
- Ship one expand/contract migration that adds `district_code`, backfills the seeded `district = "Quận 7"` row to `quan-7`, and adds the unique partial index.

## Positive Consequences

- `INV-ADDR-1` holds: the fee surface can only see coordinates the server derived from a validated district.
- One default per user is a database guarantee, not a service convention.
- The address cap bounds response size and abuse.
- Historical orders keep their own snapshot and are unaffected by address deletion.

## Negative Consequences / Risks

- District centroids approximate a real address, so fees are district-level rather than street-level.
- A user whose address lies near a district boundary may receive a slightly wrong distance.
- Adding a district requires updating `HCMC_DISTRICTS` and the accepted-code validation.
- A missing index or skipped transaction reintroduces the two-default race.

## Explicit Tradeoffs

- **District centroid over geocoding**: no third-party dependency or API cost wins over street-level accuracy.
- **Hard delete over soft delete**: `user_addresses` stays out of the soft-delete list and history is preserved by snapshots.
- **Server-derived coordinates over client-supplied**: fee integrity wins over map-picker precision.
