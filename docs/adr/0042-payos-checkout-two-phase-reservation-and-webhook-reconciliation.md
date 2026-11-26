---
status: Accepted
date: 2026-11-25
deciders: ngxccc
---

# 42. PayOS Checkout Two-Phase Reservation and Idempotent Webhook Reconciliation

## Context

Issue `#243` wires PayOS checkout initiation and HMAC-SHA256 webhook reconciliation onto the `PaymentsModule` driver seam (`#242`) and checkout-time FEFO reservation architecture (`ADR-0038`). Integrating an external synchronous payment gateway (`PayOSAdapter.createPaymentLink`, up to `10_000 ms` HTTP I/O) and an asynchronous public webhook (`POST /api/v1/payments/payos/webhook`) into `OrdersService` surfaces five hard-to-reverse architectural trade-offs:

1. **DB lock duration vs external HTTP I/O**: `OrdersService` holds `FOR UPDATE` locks on `batches` and `users` during checkout (`ADR-0038`). Calling `PayOSAdapter.createPaymentLink` inside `db.transaction()` would hold row locks across network I/O and risk orphaned PayOS links on DB rollback.
2. **Checkout API surface**: Extending `POST /api/v1/orders/checkout` with `paymentMethod` (`cod | payos`) vs introducing a separate `/orders/checkout/payos` endpoint.
3. **PayOS order lifecycle & FEFO stock reservation**: Reserving FEFO `batch_allocations` at checkout (`OrderStatus.PENDING_PAYMENT` with 15-minute `reservation_expires_at`) and transitioning `PENDING_PAYMENT -> CONFIRMED` directly on verified `PAID` webhook vs deferring allocation or requiring manual staff confirmation.
4. **Late webhook vs expiry/cancellation race**: A valid PayOS webhook can arrive after the 15-minute expiry sweep or customer self-cancel has already transitioned the order to `CANCELLED` and released its `batch_allocations`.
5. **Module dependency cycle**: `OrdersModule` must import `PaymentsModule` for `PAYMENT_DRIVER_TOKEN`, while `PaymentsController` (`POST /api/v1/payments/payos/webhook`) lives in `PaymentsModule` and must update both `payments` and `orders`.

- **Target Modules**: `packages/shared`, `apps/api/src/modules/orders`, `apps/api/src/modules/payments`
- **Spec Reference**: `docs/design/payos-checkout-and-webhook-formal-spec.md`
- **Amends**: `ADR-0038` (adds `OrderStatus.PENDING_PAYMENT` to `ALLOCATED_CANCELLABLE_STATUSES` and introduces `MAX_PENDING_PAYOS_ORDERS_PER_CUSTOMER`)
- **Related**: `ADR-0013`, `ADR-0031`, `ADR-0032`, `ADR-0033`, `ADR-0035`

## Decision

- **Extend `POST /api/v1/orders/checkout` and `OrderDto`**:
  - Add optional `paymentMethod` (`PaymentMethod.COD | PaymentMethod.PAYOS`, defaulting to `PaymentMethod.COD`) to `CheckoutRequestDto`.
  - Add nullable `paymentUrl: string | null` and `reservationExpiresAt: string | null` to `OrderDto`. `paymentUrl` is populated on PayOS checkout and on `GET /api/v1/orders/me` / `GET /api/v1/orders/:id` strictly when `orderStatus === OrderStatus.PENDING_PAYMENT` (returning `null` for all other statuses/methods to preserve `ADR-0032` isolation).
  - Enforce `settings.isPayosEnabled`, reject `totalAmountVnd === 0` (`422 ORDER_PAYOS_ZERO_AMOUNT`), and enforce a per-customer pending PayOS cap (`<= 3`, `422 ORDER_PAYOS_PENDING_LIMIT_EXCEEDED`).

- **Two-phase PayOS checkout with compensating cancellation**:
  - **TX1**: Validate cart/address/shipping, lock `batches (id ASC) -> users`, deduct loyalty points, allocate FEFO `batch_allocations`, insert `orders` (`PENDING_PAYMENT`, `reservationExpiresAt = now + 15m`), and insert `payments` with a server-generated positive safe integer `orderCode` (retried on `23505` against `payments_order_code_uidx`). Commit TX1 before any network I/O.
  - **External Call**: Invoke `PaymentDriver.createPaymentLink` outside the transaction using `orders.orderCode` as `description` (`<= 25` chars) and server-derived `returnUrl`/`cancelUrl` anchored to `env.STOREFRONT_URL`.
  - **TX2 or Compensation**: On success, update `payments.paymentUrl`; on gateway failure/timeout, execute compensating `cancelOrderWithinTx` (soft-release `batch_allocations`, refund `loyaltyPointsUsed`, mark `orders` `CANCELLED` and `payments` `FAILED`) and throw `502 PAYMENT_GATEWAY_ERROR`.

- **Checkout-time FEFO allocation for `PENDING_PAYMENT` and direct `-> CONFIRMED` settlement**:
  - Add `OrderStatus.PENDING_PAYMENT` to `ALLOCATED_CANCELLABLE_STATUSES` so customer self-cancel, staff cancel, and `OrdersExpiryService` sweep (`#244`) soft-release `batch_allocations` and restore stock.
  - On verified `PAID` webhook, transition `orders` directly `PENDING_PAYMENT -> CONFIRMED` with `paymentStatus = PAID` and `reservationExpiresAt = null`, making paid orders immediately pickable without manual staff confirmation.

- **Fail-closed, idempotent webhook reconciliation in `PaymentsWebhookService`**:
  - `POST /api/v1/payments/payos/webhook` is public (no JWT, no `Idempotency-Key`, `@SkipThrottle`), preserves dynamic `data` keys for HMAC-SHA256 canonicalization, and returns `apiSuccess({ received: true })` (`200 OK`).
  - `PaymentDriver.verifyWebhook` failure returns `401 PAYMENT_WEBHOOK_SIGNATURE_INVALID`.
  - Inside a single DB transaction locking `orders -> payments` (`FOR UPDATE`): unknown `orderCode` returns `404 PAYMENT_NOT_FOUND`; duplicate `PAID` / matching `referenceCode` returns `200` idempotently; `code !== "00"` leaves state pending and returns `200`; `verified.amountVnd !== payment.amount` fails closed with `422 PAYMENT_AMOUNT_MISMATCH`.
  - **Never resurrect `CANCELLED` orders**: if `orderStatus === CANCELLED` when a valid `PAID` webhook arrives, persist `rawPayload` + `referenceCode` + `paidAt` (marking payment `PAID` / logging a critical reconciliation alert for manual refund under `#245`), keep `orders.orderStatus = CANCELLED`, and return `200 OK`.
  - Keep `PaymentsWebhookService` in `PaymentsModule` operating directly on `payments` and `orders` tables to avoid circular module dependencies with `OrdersModule`.

## Positive Consequences

- Zero database row locks (`batches`, `users`) are held during PayOS HTTP I/O, preventing pool exhaustion and lock contention under gateway latency.
- Failed PayOS link creation immediately releases reserved perishable stock and loyalty points instead of leaving 15-minute zombie reservations.
- Paid PayOS orders are guaranteed stock via checkout-time FEFO allocation and become immediately pickable (`CONFIRMED`) upon webhook arrival.
- Server-derived `returnUrl`/`cancelUrl` prevent open-redirect phishing, and `CANCELLED` terminal order invariants (`GLOSSARY.md`) are preserved under late-webhook races.

## Negative Consequences / Risks

- If the API process crashes between TX1 commit and TX2 `paymentUrl` persistence (without PayOS failing), the `PENDING_PAYMENT` order holds stock until the 15-minute expiry sweep cancels it.
- Late webhooks arriving after an order was cancelled require manual staff refund/reconciliation (`#245`) rather than automatic fulfillment.
- `GET /api/v1/orders/me` and `GET /api/v1/orders/:id` perform a conditional `payments.paymentUrl` lookup only when at least one returned order is in `PENDING_PAYMENT`.

## Explicit Tradeoffs

- **Two-phase TX + compensating cancel over holding DB transaction open across `createPaymentLink`**: Accepts brief crash-window reliance on the 15-minute expiry sweep in exchange for zero network I/O inside `FOR UPDATE` transactions.
- **Unified `POST /orders/checkout` + `OrderDto.paymentUrl` over separate `/orders/checkout/payos` route**: Reuses cart/shipping/loyalty/idempotency pipeline and OpenAPI contracts at the cost of two nullable fields on `OrderDto`.
- **Direct `PENDING_PAYMENT -> CONFIRMED` on webhook over `PENDING_PAYMENT -> PENDING_CONFIRMATION`**: Eliminates redundant manual staff confirmation for prepaid VietQR orders.
- **Keep `CANCELLED` terminal on late webhook over re-allocating stock**: Preserves `CANCELLED` immutability and prevents overselling already-released perishable batches.
