---
status: Accepted
date: 2026-11-27
deciders: ngxccc
---

# 47. Product Detail FEFO Trace Summary, Redacted Rescue Progress, and Storage Instructions

## Context

Issue #255 (parent epic #9; split from #192; building on #80 / ADR-0025, #81 / ADR-0027, and #21 / ADR-0024) requires `GET /api/v1/products/:slug` to expose an active FEFO batch trace summary, near-expiry rescue progress, and optional SKU storage metadata without leaking internal batch inventory or staff fields (`ADR-0024`) and without mixing batch flash-sale pricing into `products.sale_price` (`ADR-0025`).

Reconciling #255 against the codebase surfaced four architectural tensions:

1. **Unified `ProductDto` vs. detail-only FEFO batch joins (`ADR-0027`)**: Currently `GET /api/v1/products`, `GET /api/v1/products/:slug`, `POST /api/v1/products`, `PATCH /api/v1/products/:id`, `GET /api/v1/admin/products`, and `GET /api/v1/admin/products/:id` all return `ProductDto` (`apps/api/src/modules/catalog/dto/product.dto.ts`). Extending `ProductDto` directly with active FEFO batch trace and rescue fields would bloat list responses (up to 100 items per page) and force `createProduct`, `updateProduct`, and `listProducts` to emit dummy `null` fields or run unnecessary `batches -> seasons -> plots` joins.
2. **Trace summary boundary vs. `/api/v1/trace/:batchCode` (`ADR-0024`)**: `TraceService.getTraceByBatchCode` already serves full redacted provenance (farm, plot lab tests, season, and up to 200 `farming_logs`) behind Redis cache-aside and singleflight coalescing. Duplicating those multi-table provenance queries inside uncached `GET /api/v1/products/:slug` would add latency and duplicate #45.
3. **Rescue progress vs. inventory redaction (`ADR-0024`) and checkout pricing integrity (`ADR-0031`)**: `ADR-0024` prohibits exposing internal per-batch `initialQuantity` and `availableQuantity` on unauthenticated endpoints. Meanwhile, `OrdersService` (`ADR-0031`) still prices checkout items strictly from catalog pricing (`COALESCE(sale_price, base_price)`) because batch-level 50% flash-sale checkout pricing (#34) has not landed yet. Exposing raw batch quantities would leak internal stock/yield, and exposing `discountPercent` or `rescuePriceVnd` before #34 lands would misrepresent actual checkout charges.
4. **Missing storage metadata column**: Neither `products` nor `batches` in `apps/api/src/database/schemas/catalog.schema.ts` currently stores SKU storage guidance.

- **Target modules**: `apps/api/src/modules/catalog`, `apps/api/src/database/schemas`
- **Issue**: #255 (parent epic #9; split from #192); downstream Storefront consumer: #192 / SF-02
- **Spec**: `docs/design/product-detail-fefo-trace-and-rescue-formal-spec.md`
- **Related**: ADR-0007, ADR-0011, ADR-0012, ADR-0024, ADR-0025, ADR-0026, ADR-0027 (amended by separating `ProductDetailDto` for `:slug`), ADR-0031, ADR-0033

## Decision

- **Introduce `ProductDetailDto` extending `productSchema` for `GET /api/v1/products/:slug` (amending ADR-0027)**:
  - Keep `ProductDto` (`apps/api/src/modules/catalog/dto/product.dto.ts`) as the shared contract for `GET /api/v1/products`, `GET /api/v1/admin/products`, `GET /api/v1/admin/products/:id`, `POST /api/v1/products`, and `PATCH /api/v1/products/:id`.
  - Add `productDetailSchema` / `ProductDetailDto` (`productSchema.extend(...)`) exclusively for `GET /api/v1/products/:slug`, adding nullable `activeBatchTrace` and nullable `rescueProgress`.
- **Expose a lightweight redacted `activeBatchTrace` summary without duplicating `TraceService`**:
  - Select the first sellable batch in deterministic FEFO order (`expirationDate ASC, id ASC`, matching `fefo-allocation.util.ts`) matching `product_id = product.id AND status IN ('in_stock', 'near_expiry') AND expiration_date > NOW() AND available_quantity > 0`.
  - Join `seasons` and `plots` without filtering `plots.deletedAt` (consistent with ADR-0024 historical provenance) and project only `batchCode`, `harvestDate`, `expirationDate`, `status`, `plotCode`, and `plotName` (`null` when no sellable batch exists). Storefront links or delegates to `GET /api/v1/trace/:batchCode` for full lab telemetry and `farmingLogs`.
- **Expose redacted `rescueProgress` strictly from `BatchStatus.NEAR_EXPIRY` without raw quantities or unbacked discounts**:
  - Return `rescueProgress: { expiresAt, claimedPercent }` only when the selected active FEFO batch has `status === BatchStatus.NEAR_EXPIRY`; otherwise return `null`. Do not query `farms.flashSaleConfig` from `CatalogModule`.
  - Compute `claimedPercent` as `Math.min(100, Math.max(0, Math.round(((initialQuantity - availableQuantity) / initialQuantity) * 100)))`, reflecting total batch depletion (orders plus approved `waste_logs`) without exposing `initialQuantity`, `availableQuantity`, `discountPercent`, or `rescuePriceVnd`.
- **Persist optional `storageInstructions` on `products`**:
  - Add nullable `storageInstructions` (`text`) to `products` in `apps/api/src/database/schemas/catalog.schema.ts` via one forward-only Drizzle migration.
  - Validate input via a sanitized optional/nullable string (`<= 1000` characters, normalizing empty/whitespace strings to `null`) on `CreateProductDto` and `UpdateProductDto`, and expose `storageInstructions: string | null` on `ProductDto` (inherited by `ProductDetailDto`).
- **Execute as two sequential non-transactional reads**:
  - `ProductsService.getPublicProductBySlug` runs the existing product/category + `LIVE_AVAILABLE_QUANTITY_EXPR` query first (returning `404 PRODUCT_NOT_FOUND` on miss), then runs a `LIMIT 1` FEFO batch query backed by `batches_sellable_stock_idx` (`ADR-0027`) without opening a transaction.

## Positive Consequences

- `GET /api/v1/products`, `POST /api/v1/products`, `PATCH /api/v1/products/:id`, and `/api/v1/admin/products*` remain unaffected in payload size and query count (`ADR-0027`).
- `CatalogModule` remains decoupled from `FarmsModule` (`FarmSettingsService` and `TraceService`), avoiding circular dependencies and cross-module cache invalidation.
- Public product detail never leaks batch `initialQuantity`/`availableQuantity`, `waste_logs`, staff `users.id`, or unimplemented flash-sale discount percentages (`ADR-0024`, `ADR-0025`, `ADR-0031`).
- Reuses `batches_sellable_stock_idx` (`(product_id, expiration_date, available_quantity)`) for an `O(1)` `LIMIT 1` FEFO lookup.

## Negative Consequences / Risks

- OpenAPI consumers of `GET /api/v1/products/:slug` (`apps/storefront`) receive `ProductDetailDto` instead of `ProductDto` after `bun run types:sync`; list cards continue consuming `ProductDto`.
- Because `rescueProgress` checks `batch.status === BatchStatus.NEAR_EXPIRY` rather than querying `farms.flashSaleConfig.hoursThreshold` at read time, batches entering the threshold mid-day reflect `rescueProgress` only after the expiry/near-expiry transition runs.
- Because the two queries in `getPublicProductBySlug` are non-transactional, a concurrent checkout draining the last sellable batch between query 1 and query 2 can return `availableQuantity > 0` with `activeBatchTrace: null` (fail-safe degradation).

## Explicit Tradeoffs

- **Dedicated `ProductDetailDto` for `:slug` over extending `ProductDto` globally**: trades single-DTO uniformity in `ADR-0027` for clean list/mutation payloads and zero wasted joins on `GET /products`.
- **Lightweight `activeBatchTrace` summary over inlining `TraceRecordDto`**: prevents duplicating 6-table provenance + 200-log queries on an uncached endpoint, relying on `GET /api/v1/trace/:batchCode` for full provenance.
- **Redacted `claimedPercent` without `discountPercent` over `soldPercent` + `-50%` badge**: avoids misleading customers while checkout (`ADR-0031`) still charges catalog prices and avoids mislabeling approved waste write-offs as sales.
- **Plain `storageInstructions` text column on `products` over structured JSONB `storageMetadata`**: minimizes schema and Backoffice form complexity for #255 while keeping #192 storage guidance editable per SKU.
