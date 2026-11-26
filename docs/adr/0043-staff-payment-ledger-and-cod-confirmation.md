---
status: Accepted
date: 2026-11-26
deciders: ngxccc
---

# 43. Staff Payment Ledger and Atomic COD Confirmation

## Context

Issue `#245` (parent epic `#11`, split from `#29`) adds the staff-facing payment ledger (`GET /api/v1/payments`) and manual Cash-on-Delivery (COD) settlement endpoint (`POST /api/v1/payments/:id/confirm-cod`) on top of `PaymentsModule` (`#242`, `#243`). Stress-testing the issue against the existing `orders` and `payments` architecture surfaced five design decisions:

1. **Split-brain risk between `payments.status` and `orders.paymentStatus`**: The issue's acceptance criteria only mention updating `payments.status = PAID`, `verifiedBy`, and `paidAt`, whereas `orders.paymentStatus` is denormalized on `orders` and read by `GET /api/v1/orders/me`, `StaffOrderDto`, and `OrdersService.cancelOrderWithinTx`.
2. **Deadlock hazard with `OrdersService`**: `OrdersService` (`cancelOrderWithinTx` and expiry sweep) and `PaymentsWebhookService` (`ADR-0042`) lock `orders` before `payments` (`SELECT ... FOR UPDATE`). Locking `payments` first in `confirm-cod` would create a deadlock cycle.
3. **COD eligibility and `completed` order gate**: `OrdersService.updateOrderStatus` currently allows `delivered -> completed` without checking `paymentStatus === PAID`, allowing COD orders to reach terminal `completed` while still `PENDING`.
4. **Staff RBAC scope**: `UserRole` includes `farm_staff`, `sales`, `admin`, and `super_admin`, where `farm_staff` handles field cultivation logs and production batches rather than financial reconciliation.
5. **Ledger projection & idempotency**: `payments.rawPayload` and `payments.paymentUrl` carry gateway internals unnecessary for the ledger, while `confirm-cod` retries/double-clicks need safe replay semantics without overwriting the original `verifiedBy`/`paidAt`.

- **Target Modules**: `packages/shared`, `apps/api/src/modules/payments`, `apps/api/src/modules/orders`
- **Spec Reference**: `docs/design/staff-payment-ledger-and-cod-confirmation-formal-spec.md`
- **Related**: `ADR-0013`, `ADR-0019`, `ADR-0033`, `ADR-0041`, `ADR-0042`

## Decision

- **Restrict ledger and COD confirmation RBAC to `{sales, admin, super_admin}`**:
  - Exclude `farm_staff` (alongside `customer` and `guest`) from both `GET /api/v1/payments` and `POST /api/v1/payments/:id/confirm-cod`. Financial ledger visibility and COD collection verification belong to sales and administrative roles.
- **Lock `orders -> payments` (`FOR UPDATE`) and sync `orders.paymentStatus` atomically**:
  - `POST /api/v1/payments/:id/confirm-cod` performs an unlocked lookup by `payments.id` to obtain `orderId` (rejecting missing rows with `404 PAYMENT_NOT_FOUND` and subscription-only or non-order rows with `422 PAYMENT_COD_NOT_ELIGIBLE`).
  - Inside `db.transaction()`, lock `orders` (`FOR UPDATE`) first, then `payments` (`FOR UPDATE`), matching `PaymentsWebhookService` (`ADR-0042`) and `OrdersService`.
  - Update `payments` (`status = PAID`, `verifiedBy = actorUserId`, `paidAt = now`, `updatedAt = now`) and `orders` (`paymentStatus = PAID`, `updatedAt = now`) in the same transaction without mutating `orders.orderStatus`.
- **Enforce COD eligibility and `delivered -> completed` paid-order gate**:
  - `confirm-cod` requires `paymentMethod === COD`, `transactionType === PAYMENT`, and `orders.orderStatus` in `{OrderStatus.SHIPPING, OrderStatus.DELIVERED}` (rejecting `CANCELLED`, `PENDING_CONFIRMATION`, `CONFIRMED`, `PACKING`, or `COMPLETED` with `422 PAYMENT_COD_NOT_ELIGIBLE`).
  - `OrdersService.updateOrderStatus` rejects `OrderStatus.DELIVERED -> OrderStatus.COMPLETED` when `orderRow.paymentStatus !== PaymentStatus.PAID` with `422 ORDER_PAYMENT_REQUIRED`, ensuring COD collections are confirmed before an order becomes terminal `completed`.
- **Natural DB-level idempotency on `confirm-cod`**:
  - Under the `orders -> payments` lock, if `payments.status === PaymentStatus.PAID` and `paymentMethod === PaymentMethod.COD` and `transactionType === PaymentTransactionType.PAYMENT`, return `200 OK` with the existing payment projection, preserving the original `verifiedBy` and `paidAt` (consistent with `POST /api/v1/orders/:id/confirm` in `ADR-0033`).
  - Reject `CANCELLED`, `FAILED`, or `REFUNDED` payments with `422 PAYMENT_INVALID_STATUS_TRANSITION`.
- **Sanitized, hydrated, searchable ledger projection (`GET /api/v1/payments`)**:
  - Exclude `rawPayload` and `paymentUrl` from the staff ledger DTO (`PaymentLedgerItemDto`).
  - Hydrate `orderCode` (from `orders`), `subscriptionCode` (from `subscriptions`), and `verifiedByName` (from `users.fullName`) in a single query.
  - Support `page`, `limit`, exact filters (`status`, `paymentMethod`, `transactionType`, `orderId`, `subscriptionId`, `from`, `to` on `createdAt`), and case-insensitive `search` (`ILIKE %term%`) across `orders.orderCode`, `subscriptions.subscriptionCode`, and `payments.referenceCode`, ordered deterministically by `createdAt DESC, id DESC`.

## Positive Consequences

- Eliminates `payments.status` vs `orders.paymentStatus` split-brain and prevents `orders <-> payments` lock-order deadlocks with `OrdersService` and `PaymentsWebhookService`.
- Guarantees no COD order reaches terminal `completed` while still `paymentStatus = PENDING`.
- Keeps `rawPayload` gateway metadata out of staff list responses while giving Backoffice `BO-09` hydrated references and search in one query.
- Makes `confirm-cod` safe against double-clicks and network retries without losing original `verifiedBy` attribution.

## Negative Consequences / Risks

- Existing `OrdersService` unit/integration tests that transition `delivered -> completed` with default `paymentStatus = PENDING` must set `paymentStatus = PAID` in their fixtures.
- `search` using `ILIKE %term%` across joined `orderCode`, `subscriptionCode`, and `referenceCode` cannot use B-tree prefix indexes; acceptable at farm scale and upgradeable to trigram (`pg_trgm`) indexes later if needed.

## Explicit Tradeoffs

- **Gate `delivered -> completed` on `paymentStatus === PAID` over leaving `OrdersService` untouched**: Prevents unpaid COD orders from closing as `completed` at the cost of updating `OrdersService` and its test fixtures.
- **Natural DB-level idempotency over `409 Conflict` / mandatory `Idempotency-Key`**: Avoids client key-persistence friction across UI sessions while preserving original `verifiedBy`/`paidAt`.
- **Decouple `confirm-cod` from `orders.orderStatus` transitions over auto-advancing `shipping -> delivered`**: Keeps financial settlement and physical delivery as separate state transitions.
