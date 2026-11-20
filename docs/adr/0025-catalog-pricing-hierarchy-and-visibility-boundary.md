---
status: Accepted
date: 2026-11-20
deciders: ngxccc
---

# 25. Catalog Pricing Semantics, Two-Level Category Hierarchy, and Public/Admin Visibility Boundary

## Context

Issue #80 (split from #22; parent epic #9; Storefront consumer #46 `SF-01`/`SF-02`; live-stock sibling #81) introduces category and product CRUD along with public catalog browsing filters (`categoryId`, `isVietGap`, `isUsda`, `minPriceVnd`, `maxPriceVnd`, `sort`, pagination). Reconciling #80 against the codebase and ADR-0003, ADR-0004, ADR-0005, ADR-0009, ADR-0019, and ADR-0024 surfaced four structural gaps and ambiguities:

1. **Schema drift and Flash Sale pricing ambiguity**: Issue #80 assumes `products` in `apps/api/src/database/schemas/catalog.schema.ts` already defines `salePrice`, `isVietGap`, and `isUsda`. In reality, `products` only defines `basePrice` (`CHECK (base_price >= 0)`), `unit`, `imageUrls`, `isSubscriptionEligible`, and `isActive`. Furthermore, `apps/storefront/src/types/storefront.types.ts` (`StorefrontProduct.salePriceVnd`) and `#34` (`PATCH /batches/:id/flash-sale` 50% near-expiry discount) risk conflating SKU-level catalog pricing with batch-level near-expiry flash sales. Writing batch flash-sale 50% discounts back into `products.sale_price` would leak discounts onto fresh `in_stock` batches of the same product, overwrite manual sales promotions, and race across concurrent batch expirations.
2. **Unbounded `categories.parentId` and bypassed soft-delete referential integrity**: `categories` already models `parentId` (`ON DELETE set null`) and `tier2-catalog.seeder.ts` seeds a two-level hierarchy (`Rau củ quả` -> `Cà chua`), while `products.categoryId` uses `ON DELETE restrict`. Because `categories` and `products` are soft-deletable under ADR-0003 (`UPDATE deleted_at`), PostgreSQL `ON DELETE` clauses never fire on soft delete. Without explicit service guards and locking, soft-deleting a category leaves orphaned active children or products, `PATCH /categories/:id` can create cycles or >2-level trees, and filtering `GET /products?categoryId=<parentId>` returns empty results when products sit in child categories.
3. **Public draft exposure (`isActive` vs `deletedAt`) and `:id` vs `:slug` route collision**: Both `categories` and `products` carry `isActive` alongside `deletedAt`. Collapsing them into one column would destroy the ability to hide seasonal produce without releasing the `slug` in partial unique indexes (`WHERE deleted_at IS NULL`). Exposing `isActive = false` items or an unguarded `?includeInactive=true` flag on `@Public()` routes would leak unpublished SKUs, while sharing `/api/v1/products/:param` for both `:slug` (Storefront) and `:id` (Backoffice) creates route ambiguity because UUIDv7 strings also match kebab-case regexes.
4. **Product media boundary and seeder drift**: `apps/api/src/modules/media/media.interface.ts` leaves `"products"` out of `IMAGE_ONLY_MEDIA_FOLDERS`, permitting video signatures for product folders even though `ProductImageUrls` (`packages/shared/src/jsonb-contracts.type.ts`) is strictly a `<= 5` image array, and `tier2-catalog.seeder.ts` seeds product URLs lacking `/image/upload/` and `env.CLOUDINARY_CLOUD_NAME`.

- **Target modules**: `apps/api/src/modules/catalog`, `apps/api/src/modules/media`, `apps/api/src/database/schemas`, `apps/api/src/database/seeds`, `packages/shared`
- **Issue**: #80 (parent epic #9); sibling: #81; downstream consumers: #46 (`SF-01`/`SF-02`), #34, #82, #84
- **Spec**: `docs/design/catalog-crud-formal-spec.md`
- **Related**: ADR-0003, ADR-0004, ADR-0005, ADR-0007, ADR-0009, ADR-0011, ADR-0012, ADR-0013, ADR-0024

## Decision

- **Extend `products` schema and isolate SKU markdown from batch Flash Sale**:
  - Add `salePrice` (`integer`, nullable), `isVietGap` (`boolean().default(false).notNull()`), and `isUsda` (`boolean().default(false).notNull()`) to `products` in `apps/api/src/database/schemas/catalog.schema.ts` via one forward-only migration, alongside DB-level checks `products_sale_price_non_negative` (`sale_price IS NULL OR sale_price >= 0`) and `products_sale_price_lte_base_price` (`sale_price IS NULL OR sale_price <= base_price`), plus query indexes for public listing and effective price (`COALESCE(sale_price, base_price)`).
  - Define `products.sale_price` exclusively as a **Catalog Markdown Price** managed by `sales`, `admin`, and `super_admin` via `PATCH /api/v1/products/:id`. Batch-level 50% near-expiry Flash Sales (`#34`) MUST NEVER mutate `products.sale_price`.
  - Evaluate `minPriceVnd`, `maxPriceVnd`, and `price:asc` / `price:desc` sorting on effective catalog price `COALESCE(sale_price, base_price)`, and enforce `effectiveSalePrice <= effectiveBasePrice` inside a `SELECT ... FOR UPDATE` transaction on `PATCH /api/v1/products/:id` (`422 PRODUCT_PRICE_INVALID`).
- **Two-level `categories` hierarchy, 2-level descendant filtering, and soft-delete locks**:
  - Restrict `categories` to at most **two levels** (root with `parentId = null`, child referencing an active non-deleted root with `parentId = null`). Reject self-parenting, soft-deleted parents, grandchildren (`parent.parentId !== null`), or assigning a `parentId` to a category that already owns non-deleted children with `422 CATEGORY_HIERARCHY_INVALID` while locking the target category and parent row(s) in ascending UUID order (`SELECT ... FOR UPDATE`).
  - Guard `DELETE /api/v1/categories/:id` inside a transaction (`SELECT ... FOR UPDATE` on the category) by checking for non-deleted child categories (`409 CATEGORY_HAS_CHILDREN`) and non-deleted products (`409 CATEGORY_HAS_PRODUCTS`). `DELETE /api/v1/products/:id` soft-deletes unconditionally (`deletedAt = NOW()`) so historical `batches` and `order_items` remain intact per ADR-0003 and ADR-0024.
  - Support both `categoryId` (UUIDv7) and `categorySlug` (kebab-case) mutually exclusively on `GET /api/v1/products` (rejecting both simultaneously with `400 VALIDATION_FAILED`), matching products in the target category OR its direct active children (`categories.id = target.id OR categories.parent_id = target.id`).
- **Separate Public vs. Backoffice read boundaries and immutable slugs**:
  - Keep `isActive` (seasonal hide/show preserving slug) and `deletedAt` (permanent soft delete freeing slug) separate.
  - Expose `@Public()` uncached endpoints (`@Throttle({ public: { limit: 300, ttl: 60000 } })`): `GET /api/v1/categories` (flat paginated list), `GET /api/v1/products`, and `GET /api/v1/products/:slug`, strictly filtering `isActive = true AND deletedAt IS NULL` on both `products` and their joined `categories`.
  - Expose `@ApiAuth(UserRole.SALES, UserRole.ADMIN, UserRole.SUPER_ADMIN)` backoffice read routes (`GET /api/v1/admin/categories`, `GET /api/v1/admin/categories/:id`, `GET /api/v1/admin/products`, `GET /api/v1/admin/products/:id`) capable of reading `isActive = false` records, while keeping write endpoints at `POST/PATCH/DELETE /api/v1/categories` and `/api/v1/products` with the same role gate.
  - Enforce strict lowercase kebab-case validation (`^[a-z0-9]+(?:-[a-z0-9]+)*$`) on slugs, preserve existing slugs when `PATCH` updates `name` without `slug`, and enforce `.strict()` on all query DTOs so unknown query parameters return `400`.
- **Tighten `products` Cloudinary image-only boundary**:
  - Add `"products"` to `IMAGE_ONLY_MEDIA_FOLDERS` in `apps/api/src/modules/media/media.interface.ts`, validate `products.imageUrls` with `zCloudinaryMediaUrl({ resourceTypes: ["image"], folder: "products" })` (max 5 deduplicated URLs, normalizing `null` to `[]` in responses), and update `tier2-catalog.seeder.ts` product URLs to valid `/image/upload/` paths using `env.CLOUDINARY_CLOUD_NAME`.

## Positive Consequences

- Batch-level Flash Sales (`#34`) and SKU-level Catalog Markdown Prices cannot corrupt each other or leak discounts onto fresh harvest batches.
- Two-level hierarchy validation and soft-delete locks guarantee zero cycles, zero orphaned products/subcategories, and `O(1)` parent-category filtering without recursive CTEs.
- Separating `@Public()` routes (`:slug`) from `/api/v1/admin/*` routes (`:id`, `isActive = false` visibility) prevents draft catalog leakage and eliminates UUID-vs-slug route collisions.
- Keeping public catalog reads uncached avoids redundant invalidation complexity ahead of live stock aggregation (`#81`).

## Negative Consequences / Risks

- Backoffice UI (`#46` / future catalog admin screens) must call `/api/v1/admin/categories` and `/api/v1/admin/products` to inspect inactive items rather than reusing the public endpoints.
- Deleting a parent category requires reassigning or deleting its child categories and products first (`409` guard).
- Downstream checkout (`#84`) and Flash Sale (`#34`) must define an explicit precedence rule when a product has both a `products.sale_price` markdown and a batch-level 50% flash-sale discount.

## Explicit Tradeoffs

- **SKU `sale_price` isolated from `#34` Flash Sale over writing 50% discounts to `products`**: prevents fresh batches from inheriting near-expiry discounts and avoids cron overwrite races, at the cost of resolving effective batch price in `#34`/`#84`.
- **Separate `/api/v1/admin/*` read routes over `?includeInactive=true` on `@Public()` routes**: eliminates draft leakage risk, cache-key pollution, and `:id` vs `:slug` routing ambiguity, at the cost of four small read handlers.
- **Strict 2-level hierarchy + `409` delete guard over arbitrary recursive trees + cascade `SET NULL`**: matches #80 non-goals, keeps `categoryId`/`categorySlug` descendant queries single-join `O(1)`, and blocks silent storefront/catalog breakage, at the cost of rejecting depth > 2.
- **Uncached direct PostgreSQL queries over Redis category/product caching**: preserves immediate visibility and composability with uncached live stock aggregation (`#81`), relying on partial and expression indexes for read performance.
