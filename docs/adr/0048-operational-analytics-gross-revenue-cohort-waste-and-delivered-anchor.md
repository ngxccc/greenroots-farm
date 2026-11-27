---
status: Accepted
date: 2026-11-27
deciders: ngxccc
---

# 48. Operational Analytics Gross Item Revenue, Cohort Waste Ratio, and Delivered-At Anchor

## Context

Issue #250 (parent epic #14; split from #35; sibling financial analytics issue #251; Backoffice `BO-08` consumer #62) requires `GET /api/v1/analytics/operations` to return operational revenue, waste ratio, and top products for `ADMIN` and `SUPER_ADMIN` without exposing net cashflow (`ADR-0019`).

Reconciling #250 against the codebase (`apps/api/src/database/schemas/order.schema.ts`, `apps/api/src/database/schemas/catalog.schema.ts`, `apps/api/src/database/schemas/payment.schema.ts`, `apps/api/src/modules/orders/orders.service.ts`, and `docs/design/waste-logs-two-step-formal-spec.md`) surfaced four design tensions:

1. **Operational revenue vs. order-level loyalty discounts and shipping fees**: In `orders.service.ts`, `orders.subtotal` equals `SUM(order_items.quantity * order_items.unit_price)`, `orders.discount_amount` equals `loyaltyPointsUsed`, and `orders.total_amount = subtotal - discountAmount + shippingFee`. Including `shippingFee` distorts produce sales volume; subtracting `orders.discount_amount` at the summary level causes `summary` revenue to diverge from `topProducts` (because `discount_amount` is order-level and cannot be split across `order_items` without integer-VND rounding drift per `ADR-0004`); and joining `payments` risks leaking PayOS/COD cashflow reserved for `SUPER_ADMIN` (`#251`).
2. **Delivered-at anchor vs. missing DB enforcement and index**: Revenue belongs operationally to when orders are delivered (`delivered` or `completed`), not when placed (`created_at`), which would retroactively shift historical daily buckets. Currently `orders.service.ts` sets `deliveredAt` on transition to `DELIVERED`, but `orders` lacks both a partial index on `delivered_at` and a `CHECK` constraint enforcing `delivered_at IS NOT NULL` for `delivered` and `completed` orders.
3. **Time-windowed waste ratio > 100% anomaly**: `docs/design/waste-logs-two-step-formal-spec.md` defines waste ratio as approved `waste_logs` against `batches.initial_quantity`. Filtering `waste_logs` by `reviewed_at` and `batches` by `harvest_date` independently within `[from, to]` can produce `wasteRatio > 1.0` or `0 / 0` when waste is approved in a period with few or no new harvests.
4. **Top products ranking across heterogeneous units**: `products.unit` varies (`kg`, `bó`, `gói`, etc.), so ranking by `SUM(order_items.quantity)` distorts top products across units.

- **Target modules**: `apps/api/src/modules/analytics` (new), `apps/api/src/database/schemas/order.schema.ts`, `apps/api/drizzle/`
- **Issue**: #250 (parent epic #14; split from #35); sibling: #251; Backoffice consumer: #62 (`BO-08`)
- **Spec**: `docs/design/operational-analytics-formal-spec.md`
- **Related**: ADR-0004, ADR-0005, ADR-0007, ADR-0011, ADR-0012, ADR-0013, ADR-0019, ADR-0029, ADR-0032, ADR-0040, ADR-0046

## Decision

- **Enforce strict cashflow isolation (`ADMIN` vs. `SUPER_ADMIN`)**:
  - Gate `GET /api/v1/analytics/operations` with `@ApiAuth(UserRole.ADMIN, UserRole.SUPER_ADMIN)` (`ADR-0019`).
  - Prohibit `AnalyticsService.getOperationsAnalytics` from joining `payments` or projecting `paymentMethod`, `paidAmount`, `refundedAmount`, `netCashflowVnd`, `shippingFeeVnd`, or `discountAmountVnd` (reserved for `#251`).
- **Use Gross Item Revenue (`grossItemRevenueVnd`) anchored on `orders.delivered_at`**:
  - Compute `grossItemRevenueVnd` identically across `summary`, `revenueSeries`, and `topProducts` as `SUM(order_items.quantity * order_items.unit_price)` (integer VND, `ADR-0004`) for orders with `order_status IN ('delivered', 'completed')` and `delivered_at` within `[from, to]` in `Asia/Ho_Chi_Minh`.
  - Add one forward-only Drizzle migration on `orders` (`apps/api/src/database/schemas/order.schema.ts`) to backfill any null `delivered_at` on `delivered`/`completed` rows (`COALESCE(delivered_at, updated_at)`), enforce `CHECK (order_status NOT IN ('delivered', 'completed') OR delivered_at IS NOT NULL)` (`orders_delivered_at_required`), and create partial index `orders_delivered_at_idx` on `(delivered_at) WHERE order_status IN ('delivered', 'completed') AND delivered_at IS NOT NULL`.
- **Use batch-harvest cohort Waste Ratio (`batches.harvest_date`)**:
  - Group `batches` by `harvest_date` in `[from, to]` (timezone `Asia/Ho_Chi_Minh`) and sum `approved` `waste_logs.discarded_quantity` belonging to those cohort batches:
    `wasteRatio = totalDiscardedQuantity / totalInitialQuantity` (returning `0` when `totalInitialQuantity === 0`, rounded to 4 decimal places).
  - Guarantees `0 <= wasteRatio <= 1` across both `summary` and `wasteSeries`.
- **Rank `topProducts` by `grossItemRevenueVnd` and retain soft-deleted products**:
  - Rank descending by `grossItemRevenueVnd` (tie-break by `totalQuantity DESC`, `productId ASC`), returning `productId`, `productName`, `unit`, `totalQuantity`, and `grossItemRevenueVnd` without filtering `products.deleted_at` (consistent with historical order reporting in `ADR-0032`).
  - Default `topLimit = 5` (max `20`).
- **Bound query windows and return zero-filled time-series**:
  - Accept `from`, `to` (defaults to last 30 days inclusive in `Asia/Ho_Chi_Minh`, max span `365` days), `granularity` (`day` | `week` | `month`, default `day`), and `topLimit` (`1..20`, default `5`).
  - Zero-fill empty buckets in `revenueSeries` and `wasteSeries` for direct consumption by Recharts (`BO-08`, `#62`).
  - Query PostgreSQL directly without Redis caching in `#250`.

## Positive Consequences

- `summary.grossItemRevenueVnd`, `revenueSeries`, and `topProducts[].grossItemRevenueVnd` use one consistent integer-VND formula with zero loyalty pro-rata drift.
- `ADMIN` cannot infer PayOS/COD cashflow or net profit from operational analytics (`#251` boundary preserved).
- `orders_delivered_at_required` and `orders_delivered_at_idx` eliminate null-timestamp edge cases and full-table scans on `orders`.
- Cohort-based `wasteRatio` guarantees `0 <= wasteRatio <= 1` and handles zero-harvest periods cleanly.

## Negative Consequences / Risks

- `grossItemRevenueVnd` reflects gross merchandise value before `loyaltyPointsUsed` (`discount_amount`); net merchandise cashflow remains exclusively in `#251`.
- Late-approved `waste_logs` for a batch harvested in an earlier period update that earlier harvest cohort's `wasteRatio` rather than appearing in the approval week's bucket.
- Direct PostgreSQL aggregations without Redis caching may need short-TTL caching later if order/batch volume grows significantly.

## Explicit Tradeoffs

- **Gross Item Revenue (`SUM(quantity * unit_price)`) over `subtotal - discount_amount`**: trades loyalty-discount deduction for 100% reconciliation with `topProducts`, zero integer rounding error, and clean separation from financial deductions (`#251`).
- **`orders.delivered_at` + forward-only migration over `orders.created_at`**: trades adding one `CHECK` constraint and partial index for accurate delivery-day revenue recognition without retroactive shifts on in-flight orders.
- **Harvest-cohort Waste Ratio over independent period sums**: trades showing late write-offs on the harvest cohort bucket for guaranteeing `0 <= wasteRatio <= 1`.
- **Direct PostgreSQL queries over premature Redis caching**: trades ~10–50ms query latency for zero cache-invalidation complexity across `orders`, `batches`, and `waste_logs`.
