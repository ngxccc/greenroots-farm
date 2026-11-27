---
status: Accepted
date: 2026-11-27
deciders: ngxccc
---

# 50. Batch-Level Flash Sale Toggle, Base-Price Anchoring, and FEFO Checkout Price Splitting

## Context

Issue `#249` (split from `#34`, parent epic `#14`) requires staff/admins to query near-expiry inventory (`GET /api/v1/inventory/near-expiry`) and toggle 48-hour Rescue Flash Sale eligibility on individual batches (`PATCH /api/v1/batches/:id/flash-sale`) without mutating `products.sale_price` (`ADR-0025`). Downstream consumers `#60` (`BO-07`) and `#61` (`SF-01`) expect per-batch discount configuration and actual discounted checkout pricing.

Reconciling `#249` against the codebase surfaced four architectural tensions:

1. **`BatchStatus.NEAR_EXPIRY` vs. active Flash Sale**: `BatchesExpiryService` (`apps/api/src/modules/inventory/batches-expiry.service.ts`) already transitions `in_stock` batches within `farms.flash_sale_config.hoursThreshold` to `BatchStatus.NEAR_EXPIRY` every 5 minutes. `BatchStatus.NEAR_EXPIRY` is an automatic time-based lifecycle state, not an operator-approved Flash Sale promotion. `batches` in `apps/api/src/database/schemas/catalog.schema.ts` has no columns to persist Flash Sale opt-in or discount percentage.
2. **Discount source & catalog markdown precedence (`ADR-0025`)**: `ADR-0025` isolated `products.sale_price` (Catalog Markdown Price) from batch Flash Sales and flagged that checkout (`OrdersService`, `ADR-0031`) must define an explicit precedence rule when a product has both `products.sale_price` and a batch-level Flash Sale. Applying Flash Sale on top of `COALESCE(sale_price, base_price)` would cause unintended double-discounting.
3. **Mixed-batch FEFO checkout pricing (`OrdersService`, `order_items`)**: `OrdersService` (`apps/api/src/modules/orders/orders.service.ts`) currently prices each cart item strictly at SKU level (`row.salePrice ?? row.basePrice`) and inserts one `order_items` row per `productId`. When a customer orders `5 kg` of a SKU whose FEFO allocation draws `2 kg` from a Flash Sale batch and `3 kg` from a regular `in_stock` batch, a single `order_items.unit_price` row cannot represent two unit prices without breaking `order_items.quantity * order_items.unit_price` invariants used by `OrderDto`, `ValidateCartResponseDto`, and `AnalyticsService` (`ADR-0048`).
4. **DB `CHECK` consistency across stock-depleting modules**: Enforcing a database `CHECK` invariant that `is_flash_sale = true` is only valid on active sellable stock (`status IN ('in_stock', 'near_expiry') AND available_quantity > 0`) requires every state transition to `EXPIRED` (`BatchesExpiryService`) or `SOLD_OUT` (`OrdersService` FEFO allocation and `WasteLogsService` waste approval) to clear Flash Sale flags atomically.

- **Target modules**: `apps/api/src/database/schemas`, `apps/api/src/modules/inventory`, `apps/api/src/modules/orders`, `packages/shared`
- **Issue**: `#249` (parent epic `#14`; split from `#34`; downstream: `#60`, `#61`)
- **Spec**: `docs/design/near-expiry-flash-sale-formal-spec.md`
- **Related**: `ADR-0005`, `ADR-0011`, `ADR-0012`, `ADR-0025`, `ADR-0026`, `ADR-0031`, `ADR-0033`, `ADR-0038`, `ADR-0047`, `ADR-0048`

## Decision

- **Persist opt-in Flash Sale state and per-batch discount on `batches`**:
  - Add `isFlashSale` (`boolean().default(false).notNull()`) and `flashSaleDiscountPercent` (`integer()`, nullable) to `batches` in `apps/api/src/database/schemas/catalog.schema.ts` via one forward-only Drizzle migration.
  - Enforce DB `CHECK` invariants (`ADR-0005`):
    - `batches_flash_sale_state_consistent`: `(is_flash_sale = false AND flash_sale_discount_percent IS NULL) OR (is_flash_sale = true AND flash_sale_discount_percent BETWEEN 1 AND 99 AND status IN ('in_stock', 'near_expiry') AND available_quantity > 0)`.
  - Expose `isFlashSale` and `flashSaleDiscountPercent` on `BatchDto` (`apps/api/src/modules/inventory/dto/batch.dto.ts`).
- **Anchor Flash Sale pricing on `products.base_price` (`ADR-0025`)**:
  - When a batch has `isFlashSale = true`, compute its unit price as `Math.round(products.base_price * (100 - flash_sale_discount_percent) / 100)`.
  - Never stack Flash Sale discounts on top of `products.sale_price` and never mutate `products.sale_price`.
  - Default `discountPercent` on `PATCH /api/v1/batches/:id/flash-sale` (`enabled: true`) to `farms.flash_sale_config.discountPercent` when omitted by the caller (`SALES`, `ADMIN`, `SUPER_ADMIN`).
- **Split `order_items` by `(productId, unitPriceVnd)` during FEFO allocation (`OrdersService`)**:
  - Update `OrdersService` (`validateCart` and `checkout`) to evaluate FEFO batch slices first (read-only in `validateCart`, `FOR UPDATE` in `checkout`), pricing each slice at its batch's Flash Sale unit price (if `batch.isFlashSale === true`) or catalog price (`COALESCE(sale_price, base_price)`).
  - Group contiguous or same-priced slices of a `productId` by `(productId, unitPriceVnd)` into separate `order_items` rows, preserving `order_items.quantity * order_items.unit_price = lineTotalVnd` across `OrderDto`, `ValidateCartResponseDto`, and `AnalyticsService` (`ADR-0048`) without altering `order_items` schema.
  - Note: Checkout allocation uses standard FEFO (`expirationDate ASC, id ASC`), which naturally consumes near-expiry Flash Sale batches before fresher `in_stock` batches.
- **Auto-clear Flash Sale flags on `EXPIRED` and `SOLD_OUT` transitions**:
  - Clear `isFlashSale = false` and `flashSaleDiscountPercent = null` atomically whenever `BatchesExpiryService` transitions batches to `EXPIRED`, `OrdersService` depletes `availableQuantity` to `0` (`SOLD_OUT`), or `WasteLogsService` approves waste depleting `availableQuantity` to `0` (`SOLD_OUT`).
- **Expose live near-expiry query without worker-lag blind spots**:
  - `GET /api/v1/inventory/near-expiry` (`FARM_STAFF`, `SALES`, `ADMIN`, `SUPER_ADMIN`) queries live sellable batches matching `status IN ('in_stock', 'near_expiry') AND available_quantity > 0 AND expiration_date > now AND expiration_date < now + hoursThreshold` in FEFO order (`expirationDate ASC, id ASC`), projecting `basePriceVnd`, `salePriceVnd`, `effectiveDiscountPercent`, `rescuePriceVnd`, and `hoursRemaining`.

## Positive Consequences

- `products.sale_price` and batch Flash Sales remain strictly isolated (`ADR-0025`), eliminating double-discounting and fresh-batch price leakage.
- `order_items.quantity * order_items.unit_price` remains exact for every order line, keeping `AnalyticsService` (`ADR-0048`), `OrderDto`, and `ValidateCartResponseDto` consistent without modifying `order_items` schema.
- `batches_flash_sale_state_consistent` makes invalid Flash Sale states (`EXPIRED` or `SOLD_OUT` with `is_flash_sale = true`) impossible at the PostgreSQL layer.
- `GET /api/v1/inventory/near-expiry` avoids the up-to-5-minute `BatchesExpiryService` sweep lag and enables `PATCH /api/v1/batches/:id/flash-sale` to promote `in_stock -> near_expiry` atomically inside `FOR UPDATE`.

## Negative Consequences / Risks

- A single cart line item in `OrdersService` can produce multiple `order_items` rows for the same `productId` when FEFO spans a Flash Sale batch and a regular batch. Any downstream UI or test assuming `order.items` has at most one entry per `productId` must handle multiple price-split lines.
- All code paths that set `batches.status = 'sold_out'` or `'expired'` must clear `isFlashSale` and `flashSaleDiscountPercent` or fail `batches_flash_sale_state_consistent` (`23514`).
- Public Storefront showcase (`SF-01` `#61`) still requires a dedicated `@Public()` rescue-deals read endpoint in its own issue.

## Explicit Tradeoffs

- **Per-batch `is_flash_sale` + `flash_sale_discount_percent` over farm-only `discountPercent`**: satisfies `#60` (`BO-07`) per-batch discount configuration and isolates active promotions from subsequent farm-settings edits, at the cost of one nullable integer column and `CHECK` constraint.
- **Splitting `order_items` by `(productId, unitPriceVnd)` over adding `unit_price` to `batch_allocations`**: preserves `order_items` schema and `AnalyticsService` revenue SQL (`ADR-0048`), at the cost of allowing multiple `order_items` rows per `productId` in mixed-batch orders.
- **Anchoring Flash Sale on `products.base_price` over `COALESCE(sale_price, base_price)`**: prevents unintended compounding of catalog markdowns and rescue discounts (`ADR-0025`), at the cost of ignoring `sale_price` when a batch is in Flash Sale.
