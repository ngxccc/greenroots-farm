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
- `docs/adr/0018-address-coordinate-trust-and-delivery-fee-integrity.md` — Address coordinate trust, 10-row cap, single-default invariant, and delivery fee integrity (district-code input superseded by `ADR-0044`).
- `docs/adr/0019-staff-rbac-and-admin-audit.md` — Staff RBAC, last-super-admin invariant, and admin audit log.
- `docs/adr/0020-column-scoped-write-ownership-of-users.md` — Disjoint write ownership of the `users` table by column group.
- `docs/adr/0021-farm-settings-cache-and-plot-lifecycle.md` — Farm settings singleton cache consistency, Cloudinary image URL boundary, and plot soft-delete active-season guard (shipping radius optionality partially superseded by ADR-0034).
- `docs/adr/0022-season-lifecycle-and-plot-allocation.md` — Season schema contract, single active season per plot, phase-scoped mutability, and farming-log delete guard.
- `docs/adr/0023-append-only-farming-logs-corrections-and-media-boundary.md` — Same-season correction linkage, append-only DAG semantics, phase-scoped action gate, `FOR SHARE` lock ordering, and Cloudinary `farming_logs` media boundary.
- `docs/adr/0024-public-qr-traceability-cache-and-projection-boundary.md` — Public QR traceability route, hybrid `farm_ver` epoch + batch `UNLINK` Redis cache-aside, singleflight coalescing, redacted provenance projection, and latest-200 log cap (batch timestamp types partially superseded by ADR-0026).
- `docs/adr/0025-catalog-pricing-hierarchy-and-visibility-boundary.md` — Catalog `sale_price` vs `#34` Flash Sale separation, two-level category hierarchy with soft-delete locks, public vs admin visibility boundary, and image-only `products` media scope.
- `docs/adr/0026-batch-intake-timestamptz-and-hsd-threshold.md` — Batch `timestamptz` harvest/expiration timestamps (partially superseding ADR-0024), server-generated `batchCode` with `23505` retry, `products -> seasons` `FOR SHARE` intake locking, idempotent intake, and prod fail-closed `FarmSettings` HSD threshold.
- `docs/adr/0027-live-product-stock-aggregation-and-sellable-batch-index.md` — Live uncached product `availableQuantity` scalar subquery aggregation, unified `ProductDto`, and `batches_sellable_stock_idx` partial index.
- `docs/adr/0028-batch-qr-label-origin-and-payload-contract.md` — Fail-closed `STOREFRONT_URL` origin normalization, dynamic `traceUrl` construction, deterministic `labelPayload` contract, lifecycle-agnostic label read, and deprecation/removal of `batches.qrCodeUrl` (`#102`).
- `docs/adr/0029-two-step-waste-write-off-and-review-boundary.md` — `waste_logs` as SSOT for discarded stock, `reviewed_by` + `reviewed_at` + `rejection_reason` schema evolution, 4-eyes non-self-review RBAC, pending-quota `FOR UPDATE` locking, and image-only `waste_logs` media boundary.
- `docs/adr/0030-shipping-driver-seam-and-quote-boundary.md` — `ShippingDriver` async adapter seam, `FarmSettingsService`-backed `HaversineShippingDriver`, `200` undeliverable quote projection (`feeVnd: null`), and paid `(20 km, 25 km]` subscription delivery rule (optional-radius fallback partially superseded by `ADR-0034`; `districtCode` quote input superseded by `ADR-0044`).
- `docs/adr/0031-cod-checkout-loyalty-redemption-and-cart-validation-boundary.md` — `PENDING_CONFIRMATION` COD initial state with atomic `payments` row, catalog-only checkout pricing (`COALESCE(sale_price, base_price)`), `1 pt = 1 VND` subtotal-only loyalty redemption (`ADR-0020` ownership), `150_000 VND` merchandise MOV, diagnostic `200` `validate-cart`, and user/route-scoped Redis idempotency keys (amending `ADR-0008`).
- `docs/adr/0032-customer-order-history-projection-pagination-and-isolation.md` — Unified `OrderDto` reuse (extending `OrderItemDto` with `productImageUrl`), 2-query batch hydration, `page`/`limit` pagination backed by customer-scoped composite indexes, unfiltered historical `products` join, subscription order inclusion without `subscriptionId` exposure, zero `payments` join, `@Get("me")` before `@Get(":id")`, and anti-enumeration `404 ORDER_NOT_FOUND`.
- `docs/adr/0033-order-fsm-fefo-allocation-and-soft-release-cancellation.md` — Eight-state `OrderStatus` FSM adding `confirmed` (`completed` and `cancelled` terminal), `PaymentStatus.CANCELLED`, single-statement ascending-`id` `FOR UPDATE` FEFO batch allocation, natural DB-level idempotency on `POST /orders/:id/confirm`, `StaffOrderDto` separation, soft-release `batch_allocations.released_at` with partial unique index, batch status re-evaluation and loyalty refund on cancellation, and paid-order cancellation guard.
- `docs/adr/0034-shipping-config-radius-invariants-and-validation-codes.md` — Required `FarmShippingConfig` radii across read/write and Tier 1 seeding, stateless DTO cross-field radius invariants (`subscriptionFreeRadiusKm <= maxRadiusKm`, `freeKmThreshold <= maxRadiusKm`), dedicated `@greenroots/shared` error codes with `ZodValidationPipe` English-reason mapping, and pre-launch JSONB backfill migration (partially superseding ADR-0021 and ADR-0030).
- `docs/adr/0035-separate-runtime-module-constants-from-pure-interfaces.md` — Compile-time-only `*.interface.ts` boundary, `<module>.constant.ts` ownership, shared `common/constants/` consolidation, and compiler-backed purity test (partially superseding ADR-0011).
- `docs/adr/0036-storefront-bff-http-only-session-and-singleflight-refresh.md` — Storefront strict BFF `httpOnly` cookie session, Next.js `proxy.ts` proactive refresh, `sha256(refreshToken)` single-flight coalescer with stale-cookie grace marker, `<Suspense>` header hydration, and transitional role policy (`#122`; transitional role policy superseded by `ADR-0039`).
- `docs/adr/0037-bff-client-metadata-forwarding-and-shared-secret-trust-boundary.md` — BFF client `User-Agent` sanitization and `INTERNAL_PROXY_SECRET`-authenticated `X-BFF-Client-IP` forwarding across Storefront auth actions, `proxy.ts`, `session.server.ts`, `client-info.util.ts`, and `CustomThrottlerGuard` (`#183`).
- `docs/adr/0038-checkout-time-fefo-reservation-and-customer-cancel.md` — Checkout-time FEFO batch allocation (`batches -> users` lock order), per-customer pending COD cap, `reservation_expires_at` `FOR UPDATE SKIP LOCKED` expiry sweep, and pre-confirmation customer self-cancel (amending `ADR-0031` and `ADR-0033`).
- `docs/adr/0039-surface-scoped-authentication-and-refresh-binding.md` — Surface-scoped login/refresh endpoints (`/auth/customer/*`, `/auth/staff/*`), `refresh_tokens.surface` binding, fail-closed cross-surface revocation, `403 AUTH_SURFACE_FORBIDDEN`, and Storefront BFF customer-role defense-in-depth (`#145`; supersedes transitional role policy in `ADR-0036`).
- `docs/adr/0040-complaint-submission-window-and-media-verification.md` — Immutable `orders.delivered_at` timestamp, 24-hour `delivered`/`completed` complaint eligibility, single-complaint uniqueness (`409`), and out-of-transaction Cloudinary Admin API metadata verification (`<= 5MB` images, `<= 15MB` / `<= 15s` video; extends `ADR-0009`).
- `docs/adr/0041-subscription-prepaid-activation-and-snapshot-contract.md` — `SubscriptionStatus.PENDING_PAYMENT` prepaid activation gate, upfront `(subscriptionFreeRadiusKm, maxRadiusKm]` shipping fee collection, `receiverName`/`receiverPhone` snapshot columns, DB `CHECK` invariants (`ADR-0005`), and checkout pending cap (`#30`).
- `docs/adr/0042-payos-checkout-two-phase-reservation-and-webhook-reconciliation.md` — Unified `POST /orders/checkout` PayOS initiation, two-phase TX + compensating cancel around `PaymentDriver.createPaymentLink`, `PENDING_PAYMENT` FEFO reservation & `-> CONFIRMED` transition, server-derived redirect URLs, and fail-closed idempotent webhook reconciliation (`#243`).
- `docs/adr/0043-staff-payment-ledger-and-cod-confirmation.md` — Staff-scoped (`sales`, `admin`, `super_admin`) payment ledger projection, `orders -> payments` `FOR UPDATE` COD confirmation with `orders.paymentStatus` sync, natural DB-level idempotency, and `delivered -> completed` paid-order gate (`#245`).
- `docs/adr/0044-goong-place-geocoding-and-road-distance-shipping.md` — Breaking removal of `districtCode`, server-side Goong Place `placeId` geocoding (`GEOCODING_DRIVER=goong|mock`), `GoongShippingDriver` road-distance routing with Haversine fallback, Redis caching, and customer-only Goong access (`#107`, `#199`; amends `ADR-0018` and `ADR-0030`).
- `docs/adr/0045-complaint-triage-state-and-staff-projection.md` — `ComplaintStatus.TRIAGED` intermediate state, `complaints` triage audit columns (`triaged_by`, `triaged_at`, `triage_note`), strict `pending`-only `FOR UPDATE` triage FSM, and `StaffComplaintDto` projection (`#246`; extends `ADR-0040`).
- `docs/adr/0046-complaint-refund-channels-and-replacement-order.md` — Dual-channel complaint refund (`bank_transfer` ledger vs `loyalty_points` credit), `0đ` FEFO-allocated replacement order (`COD`, `PAID`, `CONFIRMED`), `complaints` resolution columns, and `complaints -> orders -> batches -> users` lock order (`#247`; extends `ADR-0045`).

### Context-Scoped Decisions

- `apps/api/docs/adr/0001-append-only-farming-logs.md` — `farming_logs` immutability trigger and correction-entry workflow.

## Ownership Rules

1. `packages/shared/GLOSSARY.md` owns cross-app vocabulary: entities, enums, statuses, money and delivery rules.
2. `apps/api/GLOSSARY.md` is authoritative for backend domain behavior and invariants.
3. `apps/storefront/GLOSSARY.md` and `apps/backoffice/GLOSSARY.md` may add surface-specific terms but MUST NOT redefine shared terms.
4. If a term conflicts, the API glossary wins; record the resolution as an ADR.

## Status

Planned contexts get a glossary when their first domain feature lands. Do not create empty glossary files.
