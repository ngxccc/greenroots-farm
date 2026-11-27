---
status: Accepted
date: 2026-11-27
deciders: ngxccc
---

# 49. Financial Cashflow Analytics Cash-Basis Model, Paid-At Anchor, and Pending COD Snapshot

## Context

Issue #251 (parent epic #14; split from #35; sibling operational analytics issue #250 / `ADR-0048`; Backoffice `BO-09` consumer #62) requires `GET /api/v1/analytics/finance` to enforce `SUPER_ADMIN`-only RBAC (`ADR-0019`) and aggregate PayOS vs. COD net cashflow.

Reconciling #251 against `apps/api/src/database/schemas/payment.schema.ts`, `apps/api/src/database/schemas/order.schema.ts`, `apps/api/src/modules/payments/payments.service.ts` (`ADR-0043`), `apps/api/src/modules/complaints/complaints.service.ts` (`ADR-0046`), and `apps/api/src/modules/subscriptions/subscriptions.service.ts` (`ADR-0041`) surfaced four design tensions:

1. **Cash-basis (`payments.paid_at`) vs. order-basis (`orders.delivered_at` or `payments.created_at`)**: PayOS orders are collected upfront before delivery, COD orders are collected and confirmed on/after delivery (`confirmCod`, `ADR-0043`), and `bank_transfer` complaint refunds (`ADR-0046`) are recorded post-delivery as new `payments` rows (`transactionType = 'refund'`, `status = 'refunded'`, `paidAt = now`). Anchoring on `orders.delivered_at` or `payments.created_at` shifts cash movements into the wrong calendar bucket and drops subscription payments (`orderId IS NULL`).
2. **Subscription PayOS inflows (`subscriptionId IS NOT NULL`) vs. order-only joins**: Prepaid subscription purchases (`ADR-0041`) create `payments` rows with `paymentMethod = 'payos'`, `subscriptionId != null`, and `orderId = null`, whereas subscription redemption orders use `paymentMethod = 'subscription'` (`0đ` cashflow). An `INNER JOIN orders` on `payments` silently drops all PayOS subscription cash inflows.
3. **Database enforcement & indexing of `payments.paid_at`**: Unlike `orders.delivered_at` (`ADR-0048`), `payments` currently has no `CHECK` constraint enforcing `paid_at IS NOT NULL` when `status IN ('paid', 'refunded')` and no index on `paid_at`.
4. **Unreconciled COD vs. delivered operational revenue (`BO-08` vs. `BO-09`)**: `shipping`/`delivered` COD orders whose payment has not yet been confirmed via `confirmCod` (`payments.status = 'pending'`) are not realized cashflow, yet omitting them makes `BO-09` appear inconsistent with `BO-08` (`delivered_at` revenue).

- **Target modules**: `apps/api/src/modules/analytics`, `apps/api/src/database/schemas/payment.schema.ts`, `apps/api/drizzle/`
- **Issue**: #251 (parent epic #14; split from #35); sibling: #250; Backoffice consumer: #62 (`BO-09`)
- **Spec**: `docs/design/financial-cashflow-analytics-formal-spec.md`
- **Related**: ADR-0004, ADR-0005, ADR-0007, ADR-0011, ADR-0012, ADR-0013, ADR-0019, ADR-0041, ADR-0042, ADR-0043, ADR-0046, ADR-0048

## Decision

- **Enforce `SUPER_ADMIN`-only RBAC (`ADR-0019`)**:
  - Gate `GET /api/v1/analytics/finance` with `@ApiAuth(UserRole.SUPER_ADMIN)` so `ADMIN` and all lower roles receive `403`.
- **Use Cash-Basis Aggregation anchored on `payments.paid_at` in `Asia/Ho_Chi_Minh`**:
  - Query `payments` directly (no `INNER JOIN orders` on the cashflow aggregation) restricted to `paymentMethod IN ('payos', 'cod')`, excluding `PaymentMethod.SUBSCRIPTION` (`0đ` redemptions) and excluding `loyalty_points` complaint refunds (which do not create `payments` rows or move cash).
  - **Inflow**: `transactionType = 'payment' AND status = 'paid'` with `paid_at` in `[from, to]` (`Asia/Ho_Chi_Minh`). Include both order PayOS inflows (`orderId IS NOT NULL`) and subscription PayOS inflows (`subscriptionId IS NOT NULL`), breaking them down in `summary` as `payosOrderInflowVnd` and `payosSubscriptionInflowVnd`.
  - **Outflow**: `transactionType = 'refund' AND status = 'refunded'` with `paid_at` in `[from, to]`, attributed to `payments.payment_method` (`payos` or `cod`, matching `ADR-0046`).
  - **Net**: `payosNetVnd = payosInflowVnd - payosOutflowVnd`, `codNetVnd = codInflowVnd - codOutflowVnd`, and `netCashflowVnd = payosNetVnd + codNetVnd` (signed integer VND, `ADR-0004`, because refunds in a window can exceed inflows in that window).
- **Expose `pendingCodReceivableVnd` as a separate live snapshot**:
  - Compute `pendingCodReceivableVnd` independently of `[from, to]` as `SUM(payments.amount)` where `payments.payment_method = 'cod'`, `payments.status = 'pending'`, `payments.transaction_type = 'payment'`, joined with `orders` where `orders.order_status IN ('shipping', 'delivered')`.
  - Never include `pendingCodReceivableVnd` in `netCashflowVnd` or `cashflowSeries`.
- **Add forward-only `payments.paid_at` migration**:
  - Backfill `UPDATE payments SET paid_at = COALESCE(paid_at, updated_at) WHERE status IN ('paid', 'refunded') AND paid_at IS NULL`.
  - Enforce `CHECK (status NOT IN ('paid', 'refunded') OR paid_at IS NOT NULL)` (`payments_paid_at_required`) and create partial index `payments_paid_at_idx` on `(paid_at) WHERE status IN ('paid', 'refunded') AND paid_at IS NOT NULL`.
- **Maintain query & time-series parity with `ADR-0048`**:
  - Accept `from`, `to` (default 30 days inclusive in `Asia/Ho_Chi_Minh`, max span `365` days), and `granularity` (`day` | `week` | `month`, default `day`).
  - Return zero-filled `cashflowSeries` for Recharts (`BO-09`, `#62`) and query PostgreSQL directly without Redis caching in `#251`.

## Positive Consequences

- PayOS order and subscription inflows, COD collections, and `bank_transfer` refunds reconcile 1:1 with `payments` on the exact date cash moved.
- `netCashflowVnd = payosNetVnd + codNetVnd` holds identically across `summary` and every `cashflowSeries` bucket.
- `pendingCodReceivableVnd` gives `SUPER_ADMIN` visibility into uncollected/unreconciled COD on `shipping`/`delivered` orders without polluting cash-basis net cashflow.
- `payments_paid_at_required` and `payments_paid_at_idx` eliminate null-timestamp edge cases and full-table scans on `payments`.

## Negative Consequences / Risks

- Because `netCashflowVnd` is signed integer VND, a period with high `bank_transfer` refunds and low inflows can yield negative `payosNetVnd`, `codNetVnd`, or `netCashflowVnd` (callers and `BO-09` charts must handle negative integers).
- `bank_transfer` refunds for COD orders (`ADR-0046`) are recorded with `paymentMethod = 'cod'` in `payments`, so they reduce `codNetVnd` (channel attribution) rather than `payosNetVnd` even though the payout used bank transfer.
- Direct PostgreSQL aggregations without Redis caching may need short-TTL caching later if `payments` volume grows significantly.

## Explicit Tradeoffs

- **Cash-basis (`payments.paid_at`) over order-basis (`orders.delivered_at`)**: trades alignment with `BO-08` delivery dates for accurate cash reconciliation across prepaid PayOS, post-delivery COD, subscriptions, and post-delivery refunds.
- **Channel-attributed `payments.payment_method` for refunds over reclassifying COD refunds**: preserves `payments` as a single-table SSOT without needing a separate payout-channel column.
- **Live `shipping`/`delivered` `pendingCodReceivableVnd` snapshot over all `pending` COD payments**: excludes unconfirmed/unpacked orders so receivable reflects cash genuinely in transit or awaiting `confirmCod` (`ADR-0043`).
- **Direct PostgreSQL queries over premature Redis caching**: keeps `#251` focused and avoids cache-invalidation complexity across `payments`, `orders`, and `subscriptions` (deferred to future optimization if needed).
