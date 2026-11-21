---
status: Accepted
date: 2026-11-21
deciders: ngxccc
---

# 32. Customer Order History Projection, Pagination, and Isolation Boundary

## Context

Issue `#85` (split from `#26`, parent epic `#10`, storefront consumer `#50`) adds read-only customer order history endpoints `GET /api/v1/orders/me` and `GET /api/v1/orders/:id` to `apps/api/src/modules/orders/*`. Reconciling `#85` against `#84` (`ADR-0031`), `apps/api/src/database/schemas/order.schema.ts`, `packages/shared/src/error-dictionary.ts`, and `docs/standards/database-and-migrations.md` surfaced four architectural tensions:

1. **List projection reuse vs. slim summary DTO**: `OrderDto` (`apps/api/src/modules/orders/dto/order.dto.ts`) already enforces a closed customer projection for `POST /api/v1/orders/checkout` (excluding `customerId`, `subscriptionId`, `batchAllocations`, and `payments` gateway columns), while embedding `items[]` and recipient snapshot fields. Introducing a separate `OrderSummaryDto` for `GET /api/v1/orders/me` risks contract divergence with `#50` or extra round-trips to render order previews.
2. **Offset pagination requirement vs. keyset pagination standard**: `docs/standards/database-and-migrations.md` §3 prescribes keyset pagination (`created_at`, `id`) for large, changing lists, whereas `#85` explicitly requires `page`, `limit`, `status`, and `sort` using `PaginatedApiResponseDto` (`PaginationMetaDto` with `total` and `totalPages`). Furthermore, `orders` currently indexes only `(customer_id)` and `(order_status, created_at)`, lacking customer-scoped composite indexes for status-filtered and time-ordered reads.
3. **Historical `order_items` join across soft-deleted or inactive products**: `order_items` persists `(orderId, productId, quantity, unitPrice)` (`ON DELETE RESTRICT` to `products`) without snapshotting `productName`, `productSlug`, or `unit`. Filtering `products.deletedAt IS NULL` or `products.isActive = true` when reading past orders would silently drop line items or break historical order detail views after catalog archival.
4. **Route precedence, anti-enumeration `404`, and missing shared error code**: `OrdersController` must register `@Get("me")` before `@Get(":id")` so `"me"` is not captured by the `:id` UUIDv7 parameter pipe, `GET /api/v1/orders/:id` must return `404` (never `403`) for foreign-owned orders, and `packages/shared/src/error-dictionary.ts` lacks `API_ERROR_CODES.ORDER_NOT_FOUND`.

- **Target modules**: `apps/api/src/modules/orders`, `apps/api/src/database/schemas`, `apps/api/src/common/constants`, `packages/shared`
- **Issue**: `#85` (parent epic `#10`); siblings: `#84`, `#86`, `#87`; storefront consumer: `#50`
- **Spec**: `docs/design/customer-order-history-formal-spec.md`
- **Related**: `ADR-0002`, `ADR-0003`, `ADR-0004`, `ADR-0011`, `ADR-0012`, `ADR-0013`, `ADR-0031`

## Decision

- **Unified closed `OrderDto` across checkout, list, and detail via 2-query batch loading**:
  - Reuse `OrderDto` (`orderSchema`) for both `GET /api/v1/orders/me` (`PaginatedApiResponseDto<OrderDto>`) and `GET /api/v1/orders/:id` (`ApiResponseDto<OrderDto>`), keeping one authoritative closed projection across `#84`, `#85`, and `#50` that excludes `customerId`, `subscriptionId`, `batchAllocations`, cost fields, and all `payments` gateway/verification columns (never joining the `payments` table on read).
  - Extend `OrderItemDto` (`orderItemSchema`) with `productImageUrl: z.string().nullable()` (`products.imageUrls?.[0] ?? null`) across both `#84` checkout and `#85` order reads so `#50` renders thumbnails without extra catalog requests.
  - Include subscription-generated orders (`orders.subscriptionId IS NOT NULL`) in customer order history (`customer_id = sub`) without exposing `subscriptionId` on `OrderDto`; customers distinguish them via `paymentMethod === PaymentMethod.SUBSCRIPTION`.
  - Hydrate `GET /api/v1/orders/me` in two bounded queries (paginated `orders` query + single `order_items` `INNER JOIN products` query using `inArray(orderItems.orderId, pageOrderIds)`) instead of N+1 per-order queries or lateral subqueries, reconstructing each item's `lineTotalVnd` with the exact integer-cent math from `OrdersService.computeLineTotalVnd`.
- **Bounded `page`/`limit` pagination backed by customer-scoped composite indexes**:
  - Implement `GET /api/v1/orders/me` with `page` (1-based), `limit` (default `20`, max `100`), single `status` (`OrderStatus` enum), and whitelisted `sort` (`ORDER_SORT_OPTIONS`: `createdAt:desc`, `createdAt:asc`, `totalAmount:desc`, `totalAmount:asc`, each with deterministic `desc(orders.id)` tie-breaker), returning `PaginationMetaDto` via `buildPaginationMeta`.
  - Add two additive composite B-tree indexes to `orders` via a forward-only migration: `orders_customer_created_at_idx` (`(customer_id, created_at, id)`) and `orders_customer_status_created_at_idx` (`(customer_id, order_status, created_at, id)`).
- **Unfiltered historical `products` join for order line items**:
  - Join `order_items` to `products` without `products.deletedAt IS NULL` or `products.isActive = true` predicates so orders placed before a product is deactivated or soft-deleted continue to render complete line items and totals.
- **Strict ownership scoping, active-customer gate, and `ORDER_NOT_FOUND` anti-enumeration**:
  - Declare `@Get(ORDERS_ROUTES.ME)` before `@Get(ORDERS_ROUTES.BY_ID)` on `OrdersController` (`@ApiAuth(UserRole.CUSTOMER)`), validating `:id` strictly with `ZodValidationPipe(zUuidV7())`.
  - Add `API_ERROR_CODES.ORDER_NOT_FOUND` (with Vietnamese dictionary entry in `packages/shared/src/error-dictionary.ts`) and `MESSAGES.ORDERS.NOT_FOUND`.
  - Gate both read routes with `loadActiveCustomer(this.db, sub, false)` (`401` if user deleted/missing, `403 AUTH_ACCOUNT_SUSPENDED` if suspended) and scope `GET /api/v1/orders/:id` in SQL with `and(eq(orders.id, orderId), eq(orders.customerId, sub))`, throwing `404 ORDER_NOT_FOUND` for both non-existent UUIDv7s and orders owned by another customer.

## Positive Consequences

- Eliminates contract drift between `POST /api/v1/orders/checkout`, `GET /api/v1/orders/me`, `GET /api/v1/orders/:id`, and `#50` storefront components by sharing `OrderDto`.
- Guarantees zero N+1 queries on paginated order history while avoiding full-table or unindexed per-customer sorts via `(customer_id, ...)` composite indexes.
- Preserves historical order integrity when catalog items are later deactivated or soft-deleted without requiring an immediate `order_items` snapshot migration.
- Prevents order UUID enumeration (`404` on foreign orders) and route shadowing (`me` vs `:id`), while aligning error localization with `@greenroots/shared`.

## Negative Consequences / Risks

- Returning full `items[]` on `GET /api/v1/orders/me` yields larger response payloads than a header-only summary when a customer has up to `50` line items per order across `limit <= 100` rows.
- Retaining `page`/`limit` offset pagination means deep pages (`OFFSET`) degrade linearly with a customer's personal order count, though single-customer cardinality makes this acceptable for retail history.
- Adding `orders_customer_created_at_idx` and `orders_customer_status_created_at_idx` requires a forward-only Drizzle migration and slightly increases write amplification on `orders` inserts/status updates.
- Because `order_items` still reads `name`, `slug`, `unit`, and `imageUrls` from `products` at query time, updating a live product changes historical display metadata unless a future ADR adds snapshot columns to `order_items`.
- Extending `OrderItemDto` with `productImageUrl` requires updating `#84` checkout projection tests and regenerating OpenAPI/client contracts via `bun run types:sync`.

## Explicit Tradeoffs

- **Reusing `OrderDto` on `GET /orders/me` over introducing `OrderSummaryDto`**: trades slightly larger list JSON payloads for a single OpenAPI contract shared across checkout, list, and detail, avoiding breaking `#50` if list cards display line-item details.
- **Adding `productImageUrl` (`imageUrls?.[0] ?? null`) to `OrderItemDto` over omitting thumbnails**: avoids N+1 storefront product fetches at zero extra SQL join cost, at the cost of a minor additive update to `#84` checkout tests.
- **Including subscription-linked orders in `/orders/me` while keeping `subscriptionId` hidden over filtering them out or exposing the FK**: gives customers unified delivery tracking across retail and subscription orders (`paymentMethod: "subscription"`) without changing `OrderDto`'s `#84` header shape before `#30` lands.
- **Omitting `payments` table joins over reading `payments.paidAt`**: prevents any accidental gateway payload leakage and decouples `#85` from `#28` PayOS webhook implementation.
- **`page`/`limit` offset pagination with composite indexes over keyset cursor pagination**: intentionally trades strict adherence to `database-and-migrations.md` §3 for full compliance with `#85` acceptance criteria and `PaginationMetaDto` (`total`, `totalPages`), mitigated by per-customer scoping and `limit <= 100`.
- **Two additive composite indexes (`(customer_id, created_at, id)` and `(customer_id, order_status, created_at, id)`) over relying on `orders_customer_id_idx`**: accepts minor index maintenance overhead to eliminate in-memory sorts on both filtered and unfiltered customer order lists.
- **Unfiltered `INNER JOIN products` over migrating snapshot columns onto `order_items`**: preserves historical orders across soft-deletes/deactivations with zero `order_items` schema churn, deferring product-rename immutability unless required later.
- **Dedicated `ORDER_NOT_FOUND` over generic `NOT_FOUND`**: matches sibling resource codes (`PRODUCT_NOT_FOUND`, `BATCH_NOT_FOUND`, `ADDRESS_NOT_FOUND`) for localized Storefront error copy while keeping `404` anti-enumeration identical on missing vs. foreign orders.
