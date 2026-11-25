---
status: Accepted
date: 2026-11-25
deciders: ngxccc
---

# 38. Checkout-Time FEFO Reservation, COD Anti-Hoarding TTL, and Customer Self-Cancel

## Context

Under `ADR-0031` and `ADR-0033`, retail COD checkout (`POST /api/v1/orders/checkout`) creates `pending_confirmation` orders without locking `batches` or inserting `batch_allocations`, deferring FEFO stock allocation to staff confirmation (`POST /api/v1/orders/:id/confirm`). While this avoids locking perishable batches on unconfirmed orders, it introduces a severe customer UX failure: multiple concurrent customers can receive `201 Created` on limited stock only to have their orders cancelled later during staff confirmation.

Moving FEFO allocation into `checkoutCod` (`PENDING_CONFIRMATION`) surfaces four architectural tensions:

1. **Lock ordering reversal (`users` ↔ `batches`)**: `executeCheckoutTransaction()` (`ADR-0031`) currently locks `users` (`FOR UPDATE`) before evaluating stock, whereas `updateOrderStatus(CANCELLED)` (`ADR-0033`) locks `orders -> batches (id ASC) -> users`. Adding `allocateFefoForOrder()` after `users` `FOR UPDATE` in `checkoutCod` reverses lock acquisition order (`users -> batches` vs `batches -> users`) and deadlocks (`40P01`) under concurrent checkout and cancellation.
2. **Perishable inventory hoarding on unpaid COD orders**: Locking `batches` at `checkoutCod` without upfront payment lets bots or abandoned sessions hold short-shelf-life (`NEAR_EXPIRY` / `IN_STOCK`) produce indefinitely unless bounded by per-customer limits and automatic expiration.
3. **Customer self-cancellation boundary**: Customers need to cancel their own pending orders before staff confirmation without exposing internal `StaffOrderDto` (`batchCode`) or racing against warehouse pick/pack operations (`confirmed` / `packing`).
4. **Confirm seam & `ALLOCATED_CANCELLABLE_STATUSES` consistency**: When `PENDING_CONFIRMATION` already holds active `batch_allocations`, cancelling `PENDING_CONFIRMATION` (by customer, staff, or expiry sweep) must soft-release allocations, and `POST /api/v1/orders/:id/confirm` must no longer re-allocate stock.

- **Target modules**: `packages/shared`, `apps/api/src/database/schemas`, `apps/api/src/modules/orders`, `apps/api/test/integration`
- **Spec**: `docs/design/checkout-fefo-reservation-and-customer-cancel-formal-spec.md`
- **Amends**: `ADR-0031` (adds checkout-time FEFO allocation and pending COD cap), `ADR-0033` (shifts FEFO allocation from `confirm` to `checkout` and expands active-allocation invariant to `pending_confirmation`)
- **Related**: `ADR-0005`, `ADR-0020`, `ADR-0026`, `ADR-0029`, `ADR-0032`, `#29`

## Decision

- **Shift retail FEFO `FOR UPDATE` allocation to `POST /api/v1/orders/checkout` (`ADR-0031`, `ADR-0033`)**:
  - `executeCheckoutTransaction()` executes `allocateFefoForOrder(tx, ...)` atomically during COD checkout, transitioning depleted batches to `BatchStatus.SOLD_OUT` and inserting active `batch_allocations` (`released_at IS NULL`) for the created `PENDING_CONFIRMATION` order.
  - Expand the **FEFO Allocation Invariant** (`ADR-0033`) to include `PENDING_CONFIRMATION`: every retail order in `pending_confirmation`, `confirmed`, `packing`, or `shipping` MUST hold active `batch_allocations` (`released_at IS NULL`).
  - Expand `ALLOCATED_CANCELLABLE_STATUSES` in `apps/api/src/modules/orders/orders.constant.ts` to `[OrderStatus.PENDING_CONFIRMATION, OrderStatus.CONFIRMED, OrderStatus.PACKING]`.
  - `POST /api/v1/orders/:id/confirm` becomes a pure FSM & validation transition (`PENDING_CONFIRMATION -> CONFIRMED`): it locks `orders FOR UPDATE`, verifies active `batch_allocations` exist (`409 ORDER_INVALID_STATUS_TRANSITION` if missing), clears `orders.reservationExpiresAt = null`, and transitions `orderStatus` to `OrderStatus.CONFIRMED` (idempotent when already `CONFIRMED`).

- **Enforce deadlock-free lock ordering (`batches (id ASC) -> users`) in `checkoutCod`**:
  - Perform a non-locking `users.status` check before opening or at the start of the transaction to fail fast on missing/suspended accounts without acquiring a `users` row lock.
  - Inside `executeCheckoutTransaction()`, lock candidate sellable `batches` in ascending `id` order (`FOR UPDATE`) **before** locking the `users` row (`FOR UPDATE`).
  - Lock `users` (`FOR UPDATE`) unconditionally after `batches` (even when `loyaltyPoints === 0`) to serialize both the per-customer pending COD order cap check and `rewardPoints` deduction, preserving global relative lock order `orders -> batches (id ASC) -> users` across checkout, confirmation, and cancellation.

- **COD Anti-Hoarding Cap and `reservation_expires_at` DB Sweep (`FOR UPDATE SKIP LOCKED`)**:
  - Add static operational constants to `BUSINESS_RULES` in `packages/shared/src/business.constants.ts`:
    - `MAX_PENDING_COD_ORDERS_PER_CUSTOMER: 3`
    - `COD_CONFIRMATION_TIMEOUT_MINUTES: 120`
  - Add `API_ERROR_CODES.ORDER_PENDING_LIMIT_EXCEEDED` (`422 UnprocessableEntityException`) to `packages/shared/src/error-dictionary.ts`.
  - Add nullable `orders.reservation_expires_at` (`timestamp with time zone`) and partial index `orders_reservation_expires_at_idx` on `(reservation_expires_at) WHERE order_status IN ('pending_payment', 'pending_confirmation') AND reservation_expires_at IS NOT NULL` via a forward-only Drizzle migration.
  - `checkoutCod()` sets `reservationExpiresAt = NOW() + 120 minutes`; `confirmOrder()` clears `reservationExpiresAt = null`.
  - Run a periodic PostgreSQL sweep worker (`OrdersExpiryService` / `@nestjs/schedule` or BullMQ repeatable job) that selects expired `PENDING_CONFIRMATION` / `PENDING_PAYMENT` orders using `FOR UPDATE SKIP LOCKED`, transitions them to `OrderStatus.CANCELLED` + `PaymentStatus.CANCELLED`, soft-releases `batch_allocations`, restores `batches.availableQuantity` / `batches.status`, and refunds `loyaltyPointsUsed`.

- **Customer Self-Cancel Endpoint (`POST /api/v1/orders/:id/cancel`)**:
  - Expose `POST /api/v1/orders/:id/cancel` (`@ApiAuth(UserRole.CUSTOMER)`, `200 OK`) returning closed `OrderDto` (`ADR-0032`, never exposing `StaffOrderDto` or `batchCode`).
  - Enforce ownership (`order.customerId === sub`, returning `404 ORDER_NOT_FOUND` on mismatch per `ADR-0032` anti-enumeration).
  - Permit self-cancellation strictly from `OrderStatus.PENDING_PAYMENT` and `OrderStatus.PENDING_CONFIRMATION`; reject `CONFIRMED`, `PACKING`, `SHIPPING`, `DELIVERED`, `COMPLETED`, and `CANCELLED` with `422 ORDER_INVALID_STATUS_TRANSITION`, and block `PAID` / `SUBSCRIPTION` orders with `422 ORDER_PAID_CANCELLATION_FORBIDDEN`.
  - Reuse the shared atomic cancellation path (`orders FOR UPDATE -> releaseOrderAllocations (batches id ASC) -> refundLoyaltyPoints (users) -> update order/payment status`).

## Positive Consequences

- Eliminates post-checkout `INSUFFICIENT_STOCK` cancellations for retail COD customers under concurrent load.
- Prevents `40P01` deadlocks between concurrent COD checkouts and staff/expiry cancellations via strict `orders -> batches (id ASC) -> users` lock ordering.
- Protects perishable batch inventory against COD hoarding via per-customer pending caps (`3` orders), self-service pre-confirm cancellation, and durable PostgreSQL `reservation_expires_at` expiry sweeps (`FOR UPDATE SKIP LOCKED`) resilient to Redis restarts.
- Preserves `ADR-0032` customer DTO isolation (`OrderDto`) on `POST /api/v1/orders/:id/cancel`.

## Negative Consequences / Risks

- Abandons/unverified COD orders temporarily hold sellable batch stock for up to `COD_CONFIRMATION_TIMEOUT_MINUTES` (`120` minutes) until staff confirms, customer cancels, or the sweep job expires them.
- Keeping `MAX_PENDING_COD_ORDERS_PER_CUSTOMER` and `COD_CONFIRMATION_TIMEOUT_MINUTES` static in `BUSINESS_RULES` requires a code deploy to tune thresholds (can be promoted to `FarmSettings` later without changing the checkout/sweep architecture).
- Existing test suites that seed `PENDING_CONFIRMATION` orders without `batch_allocations` (`orders-fulfillment.spec.ts`, `orders-concurrency.spec.ts`) must be updated to reflect checkout-time allocation.

## Explicit Tradeoffs

- **Checkout-time FEFO allocation with 120-min TTL over confirmation-time allocation (`ADR-0033`)**: accepts temporary 2-hour holds on unpaid COD orders in exchange for eliminating frustrating post-checkout stockout cancellations.
- **Lock ordering `batches (id ASC) -> users` over `users -> batches` in `checkoutCod`**: avoids rewriting `updateOrderStatus` (`orders -> batches -> users`) and eliminates `40P01` deadlocks at the cost of holding `batches` locks slightly longer while reading the customer's pending-order count.
- **PostgreSQL `reservation_expires_at` + `FOR UPDATE SKIP LOCKED` sweep over Redis-only BullMQ delayed jobs**: trades sub-second expiry precision (bounded by sweep interval) for PostgreSQL durability across Redis restarts and automatic backlog recovery after downtime.
- **Static `BUSINESS_RULES` constants over `FarmSettings` JSONB UI**: avoids premature Backoffice UI and JSONB migration complexity for anti-abuse parameters, matching `ORDER_PAYMENT_TIMEOUT_MINUTES` (`15`).
- **Pre-confirmation-only customer self-cancel (`pending_payment`, `pending_confirmation`) over allowing cancel in `confirmed`**: prevents customer-vs-warehouse pick/pack races once staff has confirmed the order.
