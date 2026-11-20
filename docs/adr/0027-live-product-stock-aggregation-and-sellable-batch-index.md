---
status: Accepted
date: 2026-11-20
deciders: ngxccc
---

# 27. Live Product Stock Aggregation, Correlated Slice Subquery, and Sellable Batch Partial Index

## Context

Issue #81 (split from #22; parent epic #9; building on #80 / ADR-0025 and #82 / ADR-0026; consumed by Storefront #46 `SF-01`/`SF-02`) requires product read endpoints (`GET /api/v1/products` and `GET /api/v1/products/:slug`) to expose a live `availableQuantity` summed from sellable batches in a single aggregate query per request without N+1 loops, verified with `EXPLAIN (ANALYZE, BUFFERS)`.

Reconciling #81 against the existing codebase (`apps/api/src/modules/catalog`, `apps/api/src/database/schemas/catalog.schema.ts`, ADR-0025, and ADR-0026) surfaced four structural decisions:

1. **Issue column typo vs. persisted schema**: Issue #81 references `expiry_date > NOW()`, whereas `batches` in `apps/api/src/database/schemas/catalog.schema.ts` and ADR-0026 stores `expiration_date` (`timestamptz`).
2. **Shared `ProductDto` surface across public, admin, and mutation handlers**: `ProductsController` (`GET /products`, `GET /products/:slug`, `POST /products`, `PATCH /products/:id`) and `AdminProductsController` (`GET /admin/products`, `GET /admin/products/:id`) all return `ProductDto` (`ProductProjection` in `apps/api/src/modules/catalog/dto/product.dto.ts`), while `StorefrontProduct` (`apps/storefront/src/types/storefront.types.ts`) already consumes `availableQuantity: number` (fractional decimal from `numeric(10, 2)`).
3. **Pagination + `GROUP BY` planner hazard**: `ProductsService.listProducts` currently runs a `count(*)` query for `meta.total` and a paginated `SELECT ... ORDER BY ... LIMIT :limit OFFSET :offset` query. Rewriting the page query as `products LEFT JOIN batches ... GROUP BY products.id, categories.id` forces PostgreSQL to aggregate the entire matching catalog before applying `LIMIT`/`OFFSET`, or breaks deterministic `meta.total` if replaced with `COUNT(*) OVER()` when `offset >= total`.
4. **Missing sellable-batch index**: `batches` currently defines only `batches_product_id_idx (product_id)` and `batches_fefo_outbound_idx (expiration_date, status)`. Neither allows PostgreSQL to skip historical `expired` or `sold_out` batches or read `available_quantity` without heap fetches per product.

- **Target modules**: `apps/api/src/modules/catalog`, `apps/api/src/database/schemas`, `packages/shared`
- **Issue**: #81 (parent epic #9); dependencies: #80, #82; downstream consumers: #46 (`SF-01`/`SF-02`), #34, #84
- **Spec**: `docs/design/live-product-stock-aggregation-formal-spec.md`
- **Related**: ADR-0003, ADR-0005, ADR-0007, ADR-0011, ADR-0012, ADR-0025, ADR-0026

## Decision

- **Compute `availableQuantity` live in PostgreSQL via a correlated scalar subquery over sellable batches**:
  - Exclude any stored stock column on `products` and exclude Redis caching so Flash Sale / expiry boundaries, waste approvals (`batches.available_quantity` decrements), and batch intakes are reflected immediately on read.
  - Define sellability in the SQL predicate strictly as `batches.product_id = products.id AND batches.status IN ('in_stock', 'near_expiry') AND batches.expiration_date > NOW() AND batches.available_quantity > 0`. Batches whose `expiration_date <= NOW()` are excluded immediately even before the midnight expiry cron (`#34`) transitions `status` to `expired`, and pending `waste_logs` (`pending_approval`) are never deducted until approved.
  - Compute the sum in PostgreSQL as `COALESCE((SELECT SUM(batches.available_quantity) ...), 0)` to preserve exact decimal arithmetic on `numeric(10, 2)`, converting the resulting scalar to a non-negative JavaScript `number` (`Number(...)`) in `ProductsService.toProductProjection` (returning `0` for products with zero sellable batches).
  - Keep `listProducts`'s `SELECT count(*)` query free of `batches` joins/subqueries (since zero-stock products remain listed), and apply the scalar subquery inside the single paginated row query (after filtering/sorting/limiting `products`) and inside `getPublicProductBySlug`, `getAdminProductById`, and `updateProduct`.
- **Keep a unified `ProductDto` across Public, Admin, and Mutation endpoints**:
  - Add `availableQuantity` (`z.number().nonnegative()`) directly to `productSchema` / `ProductDto` in `apps/api/src/modules/catalog/dto/product.dto.ts` rather than splitting `PublicProductDto` and `AdminProductDto`.
  - Return `0` in `createProduct` (a newly created product has zero batches) and compute live `availableQuantity` via the same scalar subquery inside `updateProduct`'s transaction so `PATCH /api/v1/products/:id` never returns a stale `0` on in-stock SKUs.
  - Keep `ListProductsQueryDto` and `AdminListProductsQueryDto` unchanged (`.strict()`, no `inStockOnly` or stock sort parameters in #81).
- **Add a schema-driven partial composite index on `batches`**:
  - Add `batches_sellable_stock_idx` on `batches` in `apps/api/src/database/schemas/catalog.schema.ts` over `(product_id, expiration_date, available_quantity)` with partial predicate `WHERE status IN ('in_stock', 'near_expiry') AND available_quantity > 0` via one forward-only migration (`drizzle-kit generate`).
  - Place `available_quantity` as the third B-tree key column instead of a raw-SQL `INCLUDE` clause because `drizzle-orm@1.0.0-rc.5` `IndexBuilder` exposes `.on(...).where(...)` without `.include(...)`, keeping the Drizzle snapshot authoritative while enabling Index-Only Scans in PostgreSQL 18.

## Positive Consequences

- Zero stale stock reads across batch intakes, approved waste write-offs, checkout deductions, and exact-instant batch expirations without cache-invalidation coupling.
- PostgreSQL filters, sorts (`effective_price`, `name`, `created_at`), and limits `products` before probing `batches_sellable_stock_idx` for at most `limit` (default 20, max 100) rows or 1 row (`:slug`, `:id`), avoiding full-catalog `HashAggregate` spikes.
- The partial index excludes historical `expired`, `sold_out`, and zero-quantity rows, keeping index size bounded to active sellable inventory and allowing Index-Only Scans verified via `EXPLAIN (ANALYZE, BUFFERS)`.
- Keeping one `ProductDto` preserves a single OpenAPI contract via `bun run types:sync` across Storefront (`#46`) and Backoffice (`#47`).

## Negative Consequences / Risks

- Every `GET /api/v1/products`, `GET /api/v1/admin/products`, `:slug`, `:id`, and `PATCH /api/v1/products/:id` executes a live `SUM(available_quantity)` index probe per returned product row; under very high public traffic, database read scaling relies on the partial index and `@Throttle({ public: { limit: 300, ttl: 60000 } })`.
- Updating `batches.available_quantity` or transitioning `batches.status` maintains the additional `batches_sellable_stock_idx` entry (and removes it automatically once `status` leaves sellable states or `available_quantity` reaches `0`).
- Including `available_quantity` as a B-tree key column rather than `INCLUDE` adds ~8–16 bytes of tuple key comparison overhead per sellable batch row, which is negligible for a single product's active batches.
- Deferring `inStockOnly` / stock sorting keeps `.strict()` rejecting those query keys with `400` until a dedicated follow-up issue adds them.

## Explicit Tradeoffs

- **Uncached PostgreSQL live aggregation over Redis stock caching or a denormalized `products.stock` column**: eliminates cross-module cache invalidation bugs (expiry clock drift, waste approvals, order cancellations, concurrent checkouts) at the cost of a bounded index probe per read.
- **Correlated scalar subquery on paginated product slice over `LEFT JOIN batches + GROUP BY` or global CTE**: keeps `products` index-driven `LIMIT`/`OFFSET` and expression sorting (`COALESCE(sale_price, base_price)`) intact without aggregating the entire catalog or breaking `meta.total` via `COUNT(*) OVER()`, at the cost of retaining `count(*)` as a separate lightweight query in `listProducts`.
- **Unified `ProductDto` over split `PublicProductDto` vs. `AdminProductDto`**: avoids duplicated schemas/mappers and surfaces live stock in Backoffice catalog lists, at the cost of computing live `availableQuantity` on `PATCH /api/v1/products/:id`.
- **Drizzle-native 3-column partial index `(product_id, expiration_date, available_quantity)` over hand-edited `INCLUDE` migration SQL**: keeps `catalog.schema.ts` and the Drizzle snapshot 100% aligned per `docs/standards/database-and-migrations.md` §6, trading minimal key-width overhead for zero migration snapshot drift.
