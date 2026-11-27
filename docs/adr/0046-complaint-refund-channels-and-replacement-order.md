---
status: Accepted
date: 2026-11-27
deciders: ngxccc
---

# 46. Complaint Refund Channels and Zero-VND Replacement Order Resolution

## Context

Issue `#247` (split from `#33` alongside `#246`) implements `POST /api/v1/complaints/:id/resolve` for `ADMIN` and `SUPER_ADMIN` to resolve a `triaged` complaint (`ADR-0045`) via refund or `0đ` replacement order. Inspecting `PaymentDriver` (`apps/api/src/modules/payments/payments.interface.ts`), `orders` (`apps/api/src/database/schemas/order.schema.ts`), and `staff_audit_logs` (`ADR-0019`) surfaced three architectural constraints:

1. **No server-to-server PayOS refund API**: `PaymentDriver` implements only `createPaymentLink`, `verifyWebhook`, and `cancelPaymentLink`. PayOS VietQR does not support automated bank-transfer refunds, and external HTTP calls must never execute inside a PostgreSQL transaction (`ADR-0040`, `ADR-0042`).
2. **Two distinct refund mechanisms needed**: Operations require both manual bank-transfer refund recording (for VietQR/cash reconciliation on `payments`) and instant store-credit compensation via `users.rewardPoints` (`1 pt = 1 VND`).
3. **Replacement order traceability and `staff_audit_logs` scope**: `staff_audit_logs` (`ADR-0019`) enforces `targetUserId NOT NULL` exclusively for staff-account mutations. Meanwhile, `orders` has no link back to `complaints` to trace `0đ` replacement orders.

- **Target modules**: `packages/shared`, `apps/api/src/database/schemas`, `apps/api/src/modules/complaints`, `apps/api/src/modules/orders`, `apps/api/src/modules/payments`
- **Issue reference**: `#247` (Epic `#13`; formal spec: `docs/design/complaint-resolution-formal-spec.md`)
- **Extends**: `ADR-0004` (integer VND), `ADR-0008` (idempotency), `ADR-0033` (FEFO allocation), `ADR-0043` (payment ledger), `ADR-0045` (complaint triage)

## Decision

- **Pure resolution FSM on `POST /api/v1/complaints/:id/resolve`**:
  - Restrict the endpoint to `UserRole.ADMIN` and `UserRole.SUPER_ADMIN`, guarded by `@Idempotent()` (`Idempotency-Key` UUID, `ADR-0008`).
  - Only complaints in `ComplaintStatus.TRIAGED` may be resolved, transitioning strictly to `ComplaintStatus.APPROVED` (rejections of `triaged` complaints remain in `PATCH /api/v1/complaints/:id/triage` per `ADR-0045`).
  - Lock rows inside one PostgreSQL transaction in strict order `complaints -> orders -> batches -> users` (`FOR UPDATE`) to prevent deadlocks with checkout (`ADR-0038`) and COD confirmation (`ADR-0043`).

- **Dual-channel `ComplaintResolution.REFUND` (`ComplaintRefundChannel`)**:
  - Keep `ComplaintResolution` (`refund | replacement`) and add `ComplaintRefundChannel` (`bank_transfer | loyalty_points`) in `@greenroots/shared`.
  - Reject any `refund` when `orders.paymentStatus !== PaymentStatus.PAID` (`422 COMPLAINT_ORDER_NOT_PAID`).
  - Accept `refundAmountVnd` in `1..order.totalAmount` (defaulting to `order.totalAmount`):
    - **`bank_transfer`**: Insert a `payments` row (`transactionType: REFUND`, `status: REFUNDED`, `amount: refundAmountVnd`, `verifiedBy: adminId`, `paidAt: now`, optional `referenceCode`). When `refundAmountVnd === order.totalAmount` (full refund), set `orders.paymentStatus = PaymentStatus.REFUNDED` and refund `order.loyaltyPointsUsed` to `users.rewardPoints`. Partial bank refunds keep `orders.paymentStatus = PaymentStatus.PAID`.
    - **`loyalty_points`**: Credit `refundAmountVnd` points (`1 pt = 1 VND`) directly to `users.rewardPoints` without inserting a `payments` row or altering `orders.paymentStatus`.

- **Zero-VND FEFO-allocated `ComplaintResolution.REPLACEMENT` order**:
  - Support optional `items` (`[{ productId, quantity }]`, validated as a positive subset of the original order's `order_items`), defaulting to a full copy of the original order's items when omitted.
  - Create a replacement `orders` row with `subtotal = 0`, `shippingFee = 0`, `discountAmount = 0`, `loyaltyPointsUsed = 0`, `totalAmount = 0`, `paymentMethod = PaymentMethod.COD`, `paymentStatus = PaymentStatus.PAID`, and `orderStatus = OrderStatus.CONFIRMED` (bypassing MOV and loyalty deduction), allocating sellable batches via FEFO (`ADR-0033`). Fail with `422 INSUFFICIENT_STOCK` and roll back if stock is insufficient.

- **Persist resolution audit columns on `complaints`**:
  - Add `resolvedAt` (`timestamptz`), `resolutionNote` (`text`), `refundChannel` (`complaint_refund_channel` enum), `refundAmountVnd` (`integer`), and `replacementOrderId` (`uuid`, FK `orders.id` `ON DELETE SET NULL`) to `complaints` alongside `resolvedBy` and `resolution`.

## Positive Consequences

- Accurately models manual bank-transfer refunds on the Payment Ledger (`ADR-0043`) without inventing a non-existent PayOS refund API.
- Supports partial/full monetary refunds, instant loyalty-point compensation, and partial/full `0đ` FEFO replacement orders under strict transactional invariants.
- Eliminates deadlock risk via deterministic `complaints -> orders -> batches -> users` lock ordering.

## Negative Consequences / Risks

- `bank_transfer` refunds rely on Admin executing the bank transfer outside the system before recording it via `POST /resolve`.
- Adds 5 nullable resolution columns and 1 enum type (`complaint_refund_channel`) to `complaints`.

## Explicit Tradeoffs

- **Separate `ComplaintRefundChannel` enum over a third `ComplaintResolution` value**: Keeps `ComplaintResolution` (`refund | replacement`) clean while modeling `bank_transfer` vs `loyalty_points` explicitly.
- **Resolution columns on `complaints` over `staff_audit_logs`**: Avoids relaxing `staff_audit_logs.targetUserId` (`ADR-0019`) while preserving full resolution and `replacementOrderId` traceability.
- **Strict `orders.paymentStatus === PAID` gate for refunds over allowing unpaid COD refunds**: Prevents crediting money or points for orders whose cash collection was never confirmed.
