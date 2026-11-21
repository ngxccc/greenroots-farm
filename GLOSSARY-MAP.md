# Glossary Map

Multi-context domain documentation. Read the glossary for every context you touch before naming domain concepts or changing behavior.

## Context Glossaries

| Context          | Glossary                      | ADRs                        | Status               |
| ---------------- | ----------------------------- | --------------------------- | -------------------- |
| Shared contracts | `packages/shared/GLOSSARY.md` | `packages/shared/docs/adr/` | Active               |
| API              | `apps/api/GLOSSARY.md`        | `apps/api/docs/adr/`        | Planned (ADR active) |
| Storefront       | `apps/storefront/GLOSSARY.md` | `apps/storefront/docs/adr/` | Planned              |
| Backoffice       | `apps/backoffice/GLOSSARY.md` | `apps/backoffice/docs/adr/` | Planned              |

## Repo-wide Decisions

One decision per file. Read the ones that touch the area you are changing before proposing an alternative.

- `docs/adr/0001-drizzle-orm-v1-with-declarative-relations.md` — Drizzle ORM v1, `defineRelations`, and `snakeCase.table`.
- `docs/adr/0002-postgresql-native-enums-from-shared-contracts.md` — PostgreSQL native enums generated from `@greenroots/shared`.
- `docs/adr/0003-soft-delete-scope-and-partial-unique-indexes.md` — The five soft-deletable tables and their partial unique indexes.
- `docs/adr/0004-integer-vnd-money-convention.md` — Integer VND storage and the `Vnd` boundary suffix.
- `docs/adr/0005-database-enforced-business-invariants.md` — Drizzle `check()` invariants and payment ownership.
- `docs/adr/0006-database-url-normalization-and-ssl.md` — Single `DB_URL` with normalized SSL for runtime and migrations.
- `docs/adr/0007-offline-openapi-generation-and-type-sync.md` — Offline OpenAPI generation, type distribution, and Scalar docs.
- `docs/adr/0008-redis-idempotency-interceptor.md` — Redis idempotency interceptor and its five invariants.
- `docs/adr/0009-cloudinary-signed-uploads.md` — Signed direct uploads with media boundary constraints.
- `docs/adr/0010-bullmq-mail-queue.md` — Asynchronous mail queue with driver abstraction.
- `docs/adr/0011-dto-schema-co-location-and-pure-domain-interfaces.md` — Schema co-location and pure domain interfaces.
- `docs/adr/0012-generic-response-envelopes-with-allof.md` — Plain-class response envelopes composed with OpenAPI `allOf`.
- `docs/adr/0013-rfc9457-error-codes-and-client-localization.md` — RFC 9457 codes, English developer fallbacks, and client localization.
- `docs/adr/0014-account-lifecycle-and-email-verification-gate.md` — Account lifecycle and the email verification gate.
- `docs/adr/0015-single-use-refresh-token-rotation.md` — Single-use refresh token rotation.
- `docs/adr/0016-two-level-session-revocation.md` — Token-level and user-level Redis revocation.
- `docs/adr/0017-password-and-token-cryptography.md` — Scrypt password hashing and digest-only token storage.
- `docs/adr/0018-address-coordinate-trust-and-delivery-fee-integrity.md` — District-code geographic SSOT and delivery fee integrity.
- `docs/adr/0019-staff-rbac-and-admin-audit.md` — Staff RBAC, last-super-admin invariant, and admin audit log.
- `docs/adr/0020-column-scoped-write-ownership-of-users.md` — Disjoint write ownership of the `users` table by column group.
- `docs/adr/0021-farm-settings-cache-and-plot-lifecycle.md` — Farm settings singleton cache consistency, Cloudinary image URL boundary, and plot soft-delete active-season guard.
- `docs/adr/0022-season-lifecycle-and-plot-allocation.md` — Season schema contract, single active season per plot, phase-scoped mutability, and farming-log delete guard.
- `docs/adr/0023-append-only-farming-logs-corrections-and-media-boundary.md` — Same-season correction linkage, append-only DAG semantics, phase-scoped action gate, `FOR SHARE` lock ordering, and Cloudinary `farming_logs` media boundary.
- `docs/adr/0024-public-qr-traceability-cache-and-projection-boundary.md` — Public QR traceability route, hybrid `farm_ver` epoch + batch `UNLINK` Redis cache-aside, singleflight coalescing, redacted provenance projection, and latest-200 log cap (batch timestamp types partially superseded by ADR-0026).
- `docs/adr/0025-catalog-pricing-hierarchy-and-visibility-boundary.md` — Catalog `sale_price` vs `#34` Flash Sale separation, two-level category hierarchy with soft-delete locks, public vs admin visibility boundary, and image-only `products` media scope.
- `docs/adr/0026-batch-intake-timestamptz-and-hsd-threshold.md` — Batch `timestamptz` harvest/expiration timestamps (partially superseding ADR-0024), server-generated `batchCode` with `23505` retry, `products -> seasons` `FOR SHARE` intake locking, idempotent intake, and prod fail-closed `FarmSettings` HSD threshold.
- `docs/adr/0027-live-product-stock-aggregation-and-sellable-batch-index.md` — Live uncached product `availableQuantity` scalar subquery aggregation, unified `ProductDto`, and `batches_sellable_stock_idx` partial index.
- `docs/adr/0028-batch-qr-label-origin-and-payload-contract.md` — Fail-closed `STOREFRONT_URL` origin normalization, dynamic `traceUrl` construction, deterministic `labelPayload` contract, lifecycle-agnostic label read, and deprecation/removal of `batches.qrCodeUrl` (`#102`).
- `docs/adr/0029-two-step-waste-write-off-and-review-boundary.md` — `waste_logs` as SSOT for discarded stock, `reviewed_by` + `reviewed_at` + `rejection_reason` schema evolution, 4-eyes non-self-review RBAC, pending-quota `FOR UPDATE` locking, and image-only `waste_logs` media boundary.
- `docs/adr/0030-shipping-driver-seam-and-quote-boundary.md` — `ShippingDriver` async adapter seam, `FarmSettingsService`-backed `HaversineShippingDriver`, XOR `addressId | districtCode` quote boundary, `200` undeliverable quote projection (`feeVnd: null`), and paid `(20 km, 25 km]` subscription delivery rule.
- `docs/adr/0031-cod-checkout-loyalty-redemption-and-cart-validation-boundary.md` — `PENDING_CONFIRMATION` COD initial state with atomic `payments` row, catalog-only checkout pricing (`COALESCE(sale_price, base_price)`), `1 pt = 1 VND` subtotal-only loyalty redemption (`ADR-0020` ownership), `150_000 VND` merchandise MOV, diagnostic `200` `validate-cart`, and user/route-scoped Redis idempotency keys (amending `ADR-0008`).
- `docs/adr/0032-customer-order-history-projection-pagination-and-isolation.md` — Unified `OrderDto` reuse (extending `OrderItemDto` with `productImageUrl`), 2-query batch hydration, `page`/`limit` pagination backed by customer-scoped composite indexes, unfiltered historical `products` join, subscription order inclusion without `subscriptionId` exposure, zero `payments` join, `@Get("me")` before `@Get(":id")`, and anti-enumeration `404 ORDER_NOT_FOUND`.

### Context-Scoped Decisions

- `apps/api/docs/adr/0001-append-only-farming-logs.md` — `farming_logs` immutability trigger and correction-entry workflow.

## Ownership Rules

1. `packages/shared/GLOSSARY.md` owns cross-app vocabulary: entities, enums, statuses, money and delivery rules.
2. `apps/api/GLOSSARY.md` is authoritative for backend domain behavior and invariants.
3. `apps/storefront/GLOSSARY.md` and `apps/backoffice/GLOSSARY.md` may add surface-specific terms but MUST NOT redefine shared terms.
4. If a term conflicts, the API glossary wins; record the resolution as an ADR.

## Status

Planned contexts get a glossary when their first domain feature lands. Do not create empty glossary files.
