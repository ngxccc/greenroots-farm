---
status: Accepted
date: 2026-11-21
deciders: ngxccc
---

# 31. COD Checkout, Loyalty Redemption, and Cart Validation Boundary

## Context

Issue `#84` (split from `#26`, parent epic `#10`, storefront consumer `#50`) implements `POST /api/v1/orders/validate-cart` and `POST /api/v1/orders/checkout` as the first money-touching retail order mutation in `apps/api/src/modules/orders/*`. Reconciling `#84` against the schema, sibling issues (`#86`, `#28`, `#29`, `#34`), and existing ADRs (`ADR-0002`, `ADR-0004`, `ADR-0005`, `ADR-0008`, `ADR-0018`, `ADR-0020`, `ADR-0025`, `ADR-0027`, `ADR-0030`) surfaced six structural tensions:

1. **Non-existent `OrderStatus.PLACED` vs. persisted schema**: `#84` mentions `status = PLACED` for new COD orders, whereas `OrderStatus` in `packages/shared/src/domain.enums.ts`, `order_status` `pgEnum`, `apps/api/src/database/schemas/order.schema.ts`, and `tier3-operational.seeder.ts` all define and use `OrderStatus.PENDING_CONFIRMATION` paired with `PaymentStatus.PENDING` and a companion `payments` ledger row.
2. **Deferred FEFO batch allocation (`#86`) vs. catalog pricing (`ADR-0025`)**: `#86` explicitly states that checkout creates an order without touching `batches` stock and defers `batch_allocations` until `POST /api/v1/orders/:id/confirm`, while `order_items` stores `(productId, quantity, unitPrice)` without `batchId`. Until `#34` defines batch-level Flash Sale checkout semantics, checkout cannot assign or split batch prices across fresh vs. near-expiry batches.
3. **Undefined loyalty point redemption economics and missing `users.rewardPoints` ownership**: `BUSINESS_RULES.LOYALTY_POINT_CONVERSION_PERCENT` (`1`) specifies the 1% post-delivery earning rate, not redemption value or cap rules. `users.rewardPoints` lacks a DB `CHECK (reward_points >= 0)` invariant, `orders` lacks a dedicated `loyalty_points_used` column (`discountAmount` alone conflates points with future promos), and `ADR-0020` leaves `rewardPoints` write ownership `"Unassigned"`. Furthermore, shipping is fulfilled via third-party logistics (3PL), so subsidizing pass-through shipping fees with loyalty points creates cash-loss and cancellation-refund distortion.
4. **Minimum order value (`MIN_ORDER_VALUE_VND`) scope and diagnostic cart validation**: `MIN_ORDER_VALUE_VND = 150_000` is missing from `BUSINESS_RULES`, and `#84` does not state whether MOV applies to merchandise `subtotal` or post-discount/shipping `totalAmount`, nor whether `validate-cart` returns `200` diagnostics (like `POST /api/v1/shipping/quote` in `ADR-0030`) or throws `4xx` on the first issue.
5. **Address snapshot completeness**: `AddressService.resolveAddressForQuote()` in `apps/api/src/modules/users/address.service.ts` currently omits `receiverName` and `phoneNumber`, so hard-deleting or editing a saved address (`ADR-0018`) after checkout would leave `orders.shippingAddress` without delivery contact details.
6. **Cross-user PII replay in `IdempotencyService` (`ADR-0008`)**: `apps/api/src/common/services/idempotency.service.ts` currently stores Redis keys under global `idempotency:<uuid>` without `userId` or route scoping, allowing two customers submitting the same `Idempotency-Key` UUID to collide (`422`/`409`) or replay another customer's cached order snapshot.

- **Target modules**: `apps/api/src/modules/orders`, `apps/api/src/common`, `apps/api/src/modules/users`, `apps/api/src/database/schemas`, `packages/shared`
- **Issue**: `#84` (parent epic `#10`); siblings: `#85`, `#86`; downstream: `#28`, `#29`, `#34`, `#50`
- **Spec**: `docs/design/cod-checkout-and-cart-validation-formal-spec.md`
- **Related**: `ADR-0002`, `ADR-0004`, `ADR-0005`, `ADR-0008`, `ADR-0018`, `ADR-0020`, `ADR-0025`, `ADR-0027`, `ADR-0030`

## Decision

- **COD initial state, atomic `payments` row, and `isCodEnabled` gate**:
  - Persist new COD orders with `orderStatus = OrderStatus.PENDING_CONFIRMATION`, `paymentMethod = PaymentMethod.COD`, and `paymentStatus = PaymentStatus.PENDING` (never introducing `PLACED` into `OrderStatus`), alongside one initial `payments` row (`paymentMethod: COD`, `status: PENDING`, `transactionType: PAYMENT`, `amount: totalAmount`) inside the same checkout transaction.
  - Enforce `FarmSettings.isCodEnabled === true` at checkout (`422 ORDER_COD_DISABLED` when disabled) and keep `batches.availableQuantity` and `batch_allocations` untouched during `#84` (`#86` owns FEFO stock reservation on confirmation).
- **Catalog-only SKU pricing precedence at checkout**:
  - Compute every line item's `unitPrice` in `#84` strictly from live catalog pricing `COALESCE(products.salePrice, products.basePrice)` (`isActive = true AND deletedAt IS NULL` on both product and category). Batch-level 50% near-expiry Flash Sale pricing (`#34`) is excluded from `#84` until `#34` defines batch-priced checkout splitting.
- **Loyalty point redemption (`1 point = 1 VND`, subtotal-only cap) and `ADR-0020` ownership**:
  - Fix loyalty redemption at `1 point = 1 VND` (`integer`), capped strictly at merchandise subtotal (`loyaltyPointsUsed = discountAmount = Math.min(requestedPoints, user.rewardPoints, subtotal)`), never deducting against 3PL `shippingFee`. Thus `totalAmount = subtotal - discountAmount + shippingFee >= shippingFee >= 0`, and `paymentStatus` remains `PaymentStatus.PENDING` uniformly even if `shippingFee` is configured as `0`.
  - Add `orders.loyaltyPointsUsed` (`integer().default(0).notNull()`) with DB `CHECK (loyalty_points_used >= 0)` and `CHECK (discount_amount <= subtotal)`, plus `CHECK (reward_points >= 0)` on `users` via one forward-only migration.
  - Claim write ownership of `users.rewardPoints` under `ADR-0020` for `OrdersService` (`#84` deduction) and future `#29` refund/expiry restoration, locking the live `users` row (`WHERE id = sub AND deletedAt IS NULL`) with `SELECT ... FOR UPDATE` before verifying and decrementing `rewardPoints`.
- **Merchandise-based MOV (`150_000 VND`) and diagnostic `200` `validate-cart`**:
  - Define `BUSINESS_RULES.MIN_ORDER_VALUE_VND = 150_000` in `packages/shared/src/business.constants.ts`, evaluated strictly against pre-discount, pre-shipping `subtotal`. Checkout rejects violations with `422 ORDER_BELOW_MINIMUM_VALUE` (attaching `minOrderValueVnd` and `currentSubtotalVnd` in `invalidParams[].params`).
  - Expose `POST /api/v1/orders/validate-cart` (`@HttpCode(HttpStatus.OK)`) returning a `200 OK` diagnostic payload (`isValid`, `meetsMinOrderValue`, normalized `items[]` with availability & per-item issues, optional `shipping`, `loyalty`, and `totalVnd`) for `#50`, while rejecting only malformed DTOs (`400`), missing/foreign `addressId` (`404`), unknown `districtCode` (`422`), or missing `farms` (`404`).
- **Complete delivery contact snapshot and `orderCode` generation**:
  - Extend `ResolvedQuoteAddress` (`AddressService.resolveAddressForQuote`) to include `receiverName` and `phoneNumber`, persisting `"${receiverName} (${phoneNumber}) - ${formattedAddress}"` into `orders.shippingAddress`.
  - Generate `orders.orderCode` server-side as `ORD-<YYYYMMDD>-<RAND6>` (Crockford Base32, `Asia/Ho_Chi_Minh` calendar date) with up to 5 retries on `23505` (`orders_order_code_uidx`).
- **User- and route-scoped Redis idempotency keys (amending `ADR-0008`)**:
  - Namespace `IdempotencyService` Redis keys by authenticated caller identity and HTTP target (`idempotency:${scope}:${key}`, where `scope` combines `userId` when authenticated plus `${method}:${path}`), preserving all five `ADR-0008` invariants while eliminating cross-user order/PII replay and key-collision DoS.

## Positive Consequences

- Eliminates enum drift (`PLACED` vs. `PENDING_CONFIRMATION`) across `@greenroots/shared`, PostgreSQL enums, seeds, and `#85`/`#86`/`#29`.
- Protects farm cash flow from 3PL shipping subsidies while guaranteeing unambiguous loyalty-point auditability and refund accounting via `orders.loyalty_points_used`.
- Prevents concurrent double-spending of `users.rewardPoints` via `SELECT ... FOR UPDATE` + DB `CHECK (reward_points >= 0)` without introducing premature stock locks that conflict with `#86`.
- Prevents cross-user PII leakage or payload-mismatch griefing on `Idempotency-Key` collisions across different customer accounts or endpoints.
- Preserves recipient contact details inside `orders.shippingAddress` even after a customer edits or deletes a saved `user_addresses` row.

## Negative Consequences / Risks

- Leaving stock unreserved until `#86` confirmation means two concurrent customers placing separate orders for the last units of a SKU can both succeed at checkout; the second order fails later with `409 INSUFFICIENT_STOCK` during sales confirmation (`#86`).
- Scoping `IdempotencyService` by `userId` + route requires updating `IdempotencyInterceptor` and its unit tests (`idempotency.interceptor.spec.ts` / `idempotency.service.spec.ts`), and changes the Redis key format from `idempotency:<uuid>` to `idempotency:<scope>:<uuid>`.
- Adding `orders.loyalty_points_used` and `users_reward_points_non_negative` requires running `drizzle-kit generate` and applying a forward-only schema migration before `#84` integration tests run.
- Embedding `receiverName` and `phoneNumber` in `orders.shippingAddress` remains a single formatted text field rather than structured recipient columns, so downstream invoice or shipping-label rendering parses or displays it as one string.

## Explicit Tradeoffs

- **`OrderStatus.PENDING_CONFIRMATION` + atomic `payments` row over adding `PLACED` enum**: preserves `pgEnum` SSOT (`ADR-0002`), existing seed data, and `#29` payment ledger readiness over matching stale wording in `#84`.
- **`1 point = 1 VND` capped at `subtotal` over `1,000 VND` or shipping-inclusive deduction**: avoids integer-division loss on 1% earning and prevents subsidizing 3PL shipping cash outlays with loyalty points, at the cost of larger integer point balances.
- **Dedicated `orders.loyalty_points_used` + `CHECK` migration over overloading `discountAmount`**: keeps loyalty refund accounting clean when `#29` cancels unpaid/expired orders or future vouchers share `discountAmount`, at the cost of one small forward-only migration.
- **Catalog-only `COALESCE(salePrice, basePrice)` over pre-allocation Flash Sale inference**: prevents `#84` from promising a 50% near-expiry discount that `#86` may not fulfill, deferring batch-level pricing to `#34`.
- **`200 OK` diagnostic `validate-cart` over fail-fast `422`/`409`**: matches `ADR-0030` (`POST /shipping/quote`) so `#50` renders stock, MOV, and delivery-radius warnings simultaneously, while keeping `checkout` strictly transactional and fail-closed.
- **User + route namespaced Redis idempotency keys over global `idempotency:<uuid>`**: closes cross-user PII replay and collision vectors while remaining a backward-compatible in-Redis key change before production traffic.
