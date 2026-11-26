---
status: Accepted
date: 2026-11-25
deciders: ngxccc
---

# 41. Subscription Prepaid Activation, Upfront Shipping Fee, and Receiver Snapshot Contract

## Context

Issue `#30` (Epic `#12`, split per `#88`) introduces administrative subscription plan management (`subscription_plans`) and prepaid customer subscription checkout (`subscriptions`). Reconciling `#30` against `apps/api/src/database/schemas/subscription.schema.ts`, `packages/shared/src/domain.enums.ts`, `ADR-0018`, `ADR-0030`, `ADR-0038`, and downstream cron fulfillment (`#31`) surfaced four structural tensions:

1. **Unpaid activation hole in `SubscriptionStatus`**: `SubscriptionStatus` (`packages/shared/src/domain.enums.ts`) currently defines only `active`, `paused`, `completed`, and `cancelled`, and `subscriptions.status` defaults to `ACTIVE`. Inserting an `ACTIVE` subscription at `POST /api/v1/subscriptions` before PayOS webhook confirmation (`#243`) grants unpaid active subscriptions whenever a customer abandons checkout, causing `#31`'s 04:00 T3/T6 cron to generate `paid`, `COD 0đ` child orders.
2. **Prepaid `(20 km, 25 km]` shipping fee accounting (`ADR-0030` vs. `#31`)**: `ADR-0030` requires `#30` and `#31` to persist positive `shippingFeePerDelivery` for deliveries in `(subscriptionFreeRadiusKm, maxRadiusKm]`, whereas `#31` requires child orders to remain `payment_status = paid` with `COD 0đ`. Deferring `shippingFeePerDelivery` to per-delivery COD contradicts `#31`'s prepaid `0đ` COD model.
3. **Missing receiver snapshot on `subscriptions` (`ADR-0018`)**: `user_addresses` uses hard deletion (`ADR-0018`), setting `subscriptions.userAddressId` to `NULL` (`ON DELETE SET NULL`). Unlike `orders`, `subscriptions` lacks `receiverName` and `receiverPhone` columns, leaving `#31`'s cron unable to populate `NOT NULL` order recipient fields if the customer deletes their saved address.
4. **Missing DB `CHECK` invariants (`ADR-0005`)**: `subscription_plans` and `subscriptions` lack database-level `CHECK` constraints on positive prices, delivery counts, weights, non-negative remaining deliveries, and `endDate >= startDate`.

- **Target modules**: `packages/shared`, `apps/api/src/database/schemas`, `apps/api/src/database/migrations`, `apps/api/src/modules/subscriptions`
- **Issue**: `#30` (split into atomic children under `#12`)
- **Spec Reference**: `docs/design/subscription-plans-and-checkout-formal-spec.md`
- **Related**: `ADR-0002`, `ADR-0005`, `ADR-0008`, `ADR-0018`, `ADR-0030`, `ADR-0031`, `ADR-0034`, `ADR-0038`, `ADR-0042`

## Decision

- **Add `SubscriptionStatus.PENDING_PAYMENT`, `subscriptionCode`, and `reservationExpiresAt`**:
  - Extend `SubscriptionStatus` in `packages/shared/src/domain.enums.ts` (and PostgreSQL `subscription_status` enum via forward-only migration) with `PENDING_PAYMENT = "pending_payment"`.
  - Add `subscriptionCode` (`varchar(50) NOT NULL`, unique index `subscriptions_subscription_code_uidx`, format `SUB-YYYYMMDD-XXXXXX`) and nullable `reservationExpiresAt` (`timestamptz`) with partial index `subscriptions_reservation_expires_at_idx` (`WHERE status = 'pending_payment' AND reservation_expires_at IS NOT NULL`) to `subscriptions`.
  - `POST /api/v1/subscriptions` follows the two-phase PayOS checkout pattern (`ADR-0042`): TX1 inserts `subscriptions` (`PENDING_PAYMENT`, `reservationExpiresAt = now + 15m`) + `payments` (`PENDING`, `subscriptionId` set, numeric `orderCode`); `PaymentDriver.createPaymentLink` runs outside the DB transaction using `subscriptionCode` as `description`; TX2 persists `payments.paymentUrl` (or runs compensating cancellation to `CANCELLED`/`FAILED` on gateway failure).
  - `PaymentsWebhookService` reconciles `subscriptionId` payments under `subscriptions -> payments` `FOR UPDATE` locking, transitioning `PENDING_PAYMENT -> ACTIVE` (`reservationExpiresAt = null`) on verified `PAID` webhooks while never resurrecting `CANCELLED` subscriptions. Unpaid `PENDING_PAYMENT` subscriptions expire after `BUSINESS_RULES.ORDER_PAYMENT_TIMEOUT_MINUTES` (`15` minutes, swept in `#244`).
- **Collect `(subscriptionFreeRadiusKm, maxRadiusKm]` shipping upfront**:
  - At subscription checkout, `payments.amount` equals `plan.price + (plan.totalDeliveries * shippingFeePerDelivery)`. Both `price` and `shippingFeePerDelivery` remain stored separately on `subscriptions` so `#31` child orders stay `payment_status = paid` / `COD 0đ` and future cancellation/refund logic can account for undelivered cycles accurately.
- **Snapshot `receiverName` and `receiverPhone` on `subscriptions`**:
  - Add `receiverName` (`varchar(255) NOT NULL`) and `receiverPhone` (`varchar(20) NOT NULL`) to `subscriptions` in `apps/api/src/database/schemas/subscription.schema.ts`, populated from the owned `user_addresses` row at checkout.
- **Enforce DB `CHECK` invariants (`ADR-0005`) and checkout concurrency controls**:
  - Add `CHECK` constraints on `subscription_plans` (`price > 0`, `total_deliveries > 0`, `weight_per_delivery_kg > 0`) and `subscriptions` (`price >= 0`, `total_deliveries > 0`, `remaining_deliveries >= 0`, `remaining_deliveries <= total_deliveries`, `shipping_fee_per_delivery >= 0`, `end_date >= start_date`).
  - Guard `POST /api/v1/subscriptions` with a mandatory user/route-scoped `Idempotency-Key` (`ADR-0008`, `ADR-0031`), a `users` `FOR UPDATE` lock (`deletedAt IS NULL`), and a cap of `3` concurrent `PENDING_PAYMENT` subscriptions per customer.
  - Compute `startDate` server-side as the next valid `deliveryDay` strictly `>= tomorrow` (`Asia/Ho_Chi_Minh`) and `endDate` as the date of the `totalDeliveries`-th delivery.

## Positive Consequences

- Eliminates unpaid `ACTIVE` subscriptions and aligns subscription activation with PayOS webhook finality.
- Preserves `#31`'s `COD 0đ` / `payment_status = paid` child-order invariant across the entire `maxRadiusKm` delivery zone.
- Guarantees `#31` always has immutable `receiverName` and `receiverPhone` snapshots even after `user_addresses` hard deletion (`ADR-0018`).
- Enforces financial and schedule bounds directly at the PostgreSQL layer (`ADR-0005`).

## Negative Consequences / Risks

- **Breaking enum/schema migration**: Adding `pending_payment` to `subscription_status` and `NOT NULL` receiver columns requires a forward-only migration (safe pre-launch while `subscriptions` is empty).
- **Higher upfront checkout total for `(20 km, 25 km]` customers**: Prepaying `totalDeliveries * shippingFeePerDelivery` increases initial PayOS checkout amount compared to per-delivery COD.
- **Downstream coupling to `#242`/`#243` and `#31`**: Subscription checkout implementation depends on `PaymentsModule` (`#242`/`#243`), and expiry sweeping must coordinate with `OrdersExpiryService` (`#244`).

## Explicit Tradeoffs

- **`SubscriptionStatus.PENDING_PAYMENT` + atomic `payments` row over deferred row creation on webhook**: Preserves `payments_order_or_subscription_required` FK integrity and freezes plan/address/shipping snapshots at checkout time, at the cost of adding an enum value and a 15-minute expiry transition.
- **Upfront `totalDeliveries * shippingFeePerDelivery` collection over per-delivery COD**: Keeps `#31` child orders `COD 0đ` and eliminates weekly cash-collection failures, at the cost of a higher initial PayOS amount for outer-ring subscribers.
- **Adding `receiverName`/`receiverPhone` to `subscriptions` over falling back to `users`**: Prevents null/wrong recipient data when gifting or after `user_addresses` hard deletion, at the cost of two additional snapshot columns in `subscription.schema.ts`.
