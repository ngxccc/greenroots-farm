---
status: Accepted
date: 2026-11-21
deciders: ngxccc
---

# 33. Order FSM, FEFO Batch Allocation, and Soft-Release Cancellation

## Context

Issue `#86` (split from `#27`, parent epic `#10`, sibling `#87`, downstream `#28`, `#29`, `#51`) implements `POST /api/v1/orders/:id/confirm` (atomic FEFO batch stock allocation) and `PATCH /api/v1/orders/:id/status` (FSM transitions and stock release on cancellation) in `apps/api/src/modules/orders/*`. Reconciling `#86` against `@greenroots/shared`, `apps/api/src/database/schemas/order.schema.ts`, `ADR-0002`, `ADR-0005`, `ADR-0008`, `ADR-0020`, `ADR-0026`, `ADR-0027`, `ADR-0029`, `ADR-0031`, and `ADR-0032` surfaced six architectural tensions:

1. **Stale terminal-state wording vs. operational `confirmed` / `completed` separation**: `#86` and `packages/shared/GLOSSARY.md` previously stated that `cancelled` and `delivered` are terminal, whereas `OrderStatus` in `packages/shared/src/domain.enums.ts` and `tier3-operational.seeder.ts` already include `OrderStatus.COMPLETED` (`"completed"`) after `delivered`. Conversely, `OrderStatus` currently jumps directly from `pending_confirmation` to `packing` (`"Đang đóng gói"`), lacking an intermediate `confirmed` (`"Đã xác nhận"`) state: when sales confirms a COD order or a future PayOS webhook (`#28`) settles payment at night, advancing straight to `packing` misleads customers before warehouse staff begin packing, and sibling `#87` already expects `confirmed` as a valid pick-list state.
2. **Pre-payment cancellation vs. gateway failure in `PaymentStatus`**: `PaymentStatus` currently defines `pending`, `paid`, `failed`, and `refunded` with no `cancelled` state. Marking a cancelled unpaid COD order (`PaymentStatus.PENDING`) as `failed` conflates administrative/customer cancellation with PayOS payment-gateway errors (`#28`).
3. **Cross-item deadlock risk & Redis idempotency cache staleness**: Confirming crossed-item orders (Order A requesting products 1 and 2; Order B requesting products 2 and 1) by locking `batches` per line item inside a loop reverses lock acquisition order and deadlocks (`40P01`). Furthermore, caching `POST /api/v1/orders/:id/confirm` for 24 hours in Redis (`ADR-0008`) risks serving a stale `confirmed` response if the order is subsequently moved to `packing` or `cancelled`, whereas DB-level natural idempotency under `orders` `FOR UPDATE` serves live persisted state even across concurrent staff clicks with different `Idempotency-Key` headers.
4. **Customer `OrderDto` isolation vs. backoffice allocation visibility**: `ADR-0032` intentionally excludes `batch_allocations` from `OrderDto` so internal batch codes never leak to customers, while `#86` and `#51` (`BO-04`) require returning the exact FEFO allocations on confirmation and status transitions.
5. **Cancellation stock restoration vs. audit retention & `BatchStatus` lifecycle**: Deleting `batch_allocations` rows on cancellation erases which batches were previously reserved, whereas keeping them without a release marker breaks `#87` pick-list reads. Moreover, restoring `batches.available_quantity` from `0.00` (`BatchStatus.SOLD_OUT`) must never resurrect an expired batch (`expirationDate <= now`) back into `in_stock` or `near_expiry`.
6. **Loyalty refund (`ADR-0031`), paid-order cancellation guard, and lock ordering**: Cancelling an order with `loyaltyPointsUsed > 0` must restore `users.rewardPoints` atomically (`ADR-0020`, `ADR-0031`), while cancelling `PAID` or non-COD orders (`PayOS`, `SUBSCRIPTION`) via `PATCH /orders/:id/status` risks bypassing `#28`/`#29` refund accounting.

- **Target modules**: `apps/api/src/modules/orders`, `apps/api/src/database/schemas`, `apps/api/src/common/constants`, `packages/shared`, `apps/backoffice` (type sync)
- **Issue**: `#86` (split from `#27`, parent epic `#10`); siblings: `#84`, `#85`, `#87`; downstream: `#28`, `#29`, `#51`
- **Spec**: `docs/design/fefo-confirmation-and-order-fsm-formal-spec.md`
- **Related**: `ADR-0002`, `ADR-0005`, `ADR-0008`, `ADR-0020`, `ADR-0026`, `ADR-0027`, `ADR-0029`, `ADR-0031`, `ADR-0032`

## Decision

- **Extend `OrderStatus` with `CONFIRMED` and `PaymentStatus` with `CANCELLED` (`ADR-0002`)**:
  - Add `OrderStatus.CONFIRMED` (`"confirmed"`, Vietnamese label `"Đã xác nhận"`) between `pending_confirmation` and `packing` in `packages/shared/src/domain.enums.ts` and `packages/shared/src/shared-labels.ts`, and add `PaymentStatus.CANCELLED` (`"cancelled"`), propagating both via one forward-only Drizzle enum migration.
  - Define the authoritative FSM as:
    - Forward progression: `pending_confirmation` → _(only via `POST /orders/:id/confirm`)_ → `confirmed` → `packing` → `shipping` → `delivered` → `completed` (`completed` is terminal). (`pending_payment` → `confirmed` is reserved for `#28` PayOS webhook settlement.)
    - Cancellation (`cancelled`, terminal): permitted strictly from `pending_payment`, `pending_confirmation`, `confirmed`, and `packing` (never from `shipping`, `delivered`, `completed`, or `cancelled`).
    - Enforce the cross-module **FEFO Allocation Invariant**: every order in `confirmed`, `packing`, or `shipping` MUST hold active `batch_allocations` (`released_at IS NULL`); therefore `PATCH /orders/:id/status` rejects transitions into `confirmed` (`422 ORDER_INVALID_STATUS_TRANSITION`), and future `#28` webhook transitions to `confirmed` must invoke the same FEFO allocation seam.
- **Single-statement ascending-`id` `FOR UPDATE` locking and natural DB idempotency on `POST /orders/:id/confirm`**:
  - Omit `@Idempotent()` Redis caching on `POST /orders/:id/confirm` and `PATCH /orders/:id/status`; rely instead on pessimistic row locking (`SELECT ... FROM orders WHERE id = :id FOR UPDATE`) inside `READ COMMITTED` transactions.
  - On `POST /orders/:id/confirm`, return `200 OK` immediately with existing active allocations (`released_at IS NULL`) when `orderStatus === CONFIRMED` without decrementing stock; reject all other non-`pending_confirmation` statuses (`pending_payment`, `packing`, `shipping`, `delivered`, `completed`, `cancelled`) with `409 CONFLICT` (`ORDER_INVALID_STATUS_TRANSITION`).
  - Lock **all** candidate sellable batches (`status IN ('in_stock', 'near_expiry') AND expiration_date > NOW() AND available_quantity > 0`) for the order's entire distinct `productId` set in **one** SQL statement ordered by `batches.id ASC FOR UPDATE` (per `docs/standards/concurrency-and-locking.md` §2), then group per product and allocate greedily in memory by `(expirationDate ASC, id ASC)`. Any shortage rolls back and returns `409 INSUFFICIENT_STOCK` with per-product `invalidParams[]`.
  - When allocation reduces `batches.availableQuantity` to `0.00`, transition `batches.status` to `BatchStatus.SOLD_OUT` (mirroring `ADR-0029`).
- **Soft-release `batch_allocations` with `released_at` and DB integrity constraints (`ADR-0005`)**:
  - Add `batch_allocations.released_at` (`timestamp with time zone`, nullable), `CHECK (allocated_quantity > 0)` (`batch_allocations_quantity_positive`), and partial unique index `batch_allocations_active_item_batch_uidx` on `(order_item_id, batch_id) WHERE released_at IS NULL` via one forward-only migration.
  - On cancelling a `confirmed` or `packing` order, lock the allocated `batches` rows in ascending `id` order (`FOR UPDATE`), add back `allocatedQuantity`, stamp `released_at = NOW()` on those `batch_allocations` rows, and recompute `batches.status` when `newAvailableQuantity > 0`: `EXPIRED` if `expirationDate <= now`, else `NEAR_EXPIRY` if `(expirationDate - now) < hoursThreshold` (from `FarmSettingsService.getSettings()` per `ADR-0026`), else `IN_STOCK`.
- **Separate `StaffOrderDto` projection from customer `OrderDto`**:
  - Introduce `StaffOrderDto` / `StaffOrderItemDto` / `BatchAllocationSummaryDto` (`id`, `batchId`, `batchCode`, `expirationDate`, `allocatedQuantity`, `releasedAt`) for staff endpoints (`POST /orders/:id/confirm` and `PATCH /orders/:id/status`), leaving customer `OrderDto` (`ADR-0032`) closed.
  - Return active allocations (`releasedAt === null`) on `confirm` and non-cancellation transitions; return the released allocations (`releasedAt !== null`) on `cancelled` transitions for immediate backoffice auditability.
- **Cancellation side effects (`loyaltyPointsUsed`, `PaymentStatus.CANCELLED`, paid-order guard, and lock order)**:
  - Block cancelling `PAID` or `SUBSCRIPTION` orders via `PATCH /orders/:id/status` with `422 ORDER_PAID_CANCELLATION_FORBIDDEN` (deferring online refunds and subscription quota restoration to `#28`/`#29`/`#30`), while allowing unpaid `pending_payment` PayOS and `COD` cancellations.
  - For eligible unpaid cancellations, update `orders.paymentStatus` and matching `PENDING` `payments` rows to `PaymentStatus.CANCELLED`, and if `orders.loyaltyPointsUsed > 0`, lock `users` (`FOR UPDATE`, maintaining global lock order `orders -> batches (id ASC) -> users`) and restore `users.rewardPoints += orders.loyaltyPointsUsed` (`ADR-0020`, `ADR-0031`).
  - Defer 1% post-delivery loyalty earning (`LOYALTY_POINT_CONVERSION_PERCENT`) out of `#86` to a dedicated settlement/expiry ticket.

## Positive Consequences

- Eliminates premature `"Đang đóng gói"` customer messaging on COD confirmation and future PayOS settlement while keeping `#87` pick-list states (`confirmed`, `packing`, `shipping`) consistent with `@greenroots/shared`.
- Eliminates cross-item FEFO confirmation deadlocks (`40P01`) via single-statement ascending-`id` batch locking and prevents stale 24h Redis replay mismatches after post-confirm status changes.
- Preserves full batch-allocation audit history across cancellations via `released_at` while enforcing active uniqueness at the database layer.
- Prevents `SOLD_OUT` expired batches from being resurrected into sellable inventory upon order cancellation and prevents loyalty-point loss when COD orders are cancelled.
- Keeps internal `batchCode` and `releasedAt` data strictly isolated from customer `OrderDto` endpoints (`ADR-0032`).

## Negative Consequences / Risks

- Adding `OrderStatus.CONFIRMED` and `PaymentStatus.CANCELLED` alters PostgreSQL enum types (`order_status`, `payment_status`), requiring a forward-only migration, `bun run types:sync`, and aligning `#87` / `BO-04` (`#51`) to use `confirmed` and `packing` (while `confirm` -> `packing` requires one extra staff transition step compared to jumping straight to `packing`).
- Keeping `batch_allocations` rows with `released_at` means every downstream query (`#87` pick-list, confirmation idempotency, analytics) must explicitly filter `WHERE released_at IS NULL`.
- Locking all candidate sellable batches for a product set (`WHERE product_id IN (...) ORDER BY id ASC FOR UPDATE`) temporarily serializes concurrent confirmations sharing a SKU even if enough batches exist for both, trading slight write contention for absolute deadlock immunity.
- Blocking `PAID` / non-COD order cancellations in `PATCH /orders/:id/status` means staff cannot cancel paid PayOS or subscription orders through `#86` until refund orchestration lands in `#28`/`#29`.

## Explicit Tradeoffs

- **Adding `OrderStatus.CONFIRMED` (`pending_confirmation -> confirmed -> packing`) over keeping 7 states (`pending_confirmation -> packing`)**: accepts one `pgEnum` migration and one extra warehouse handoff step so customer tracking never reports `"Đang đóng gói"` before warehouse staff start packing, and aligns cleanly with `#87` and future `#28` PayOS webhooks.
- **Adding `PaymentStatus.CANCELLED` over reusing `PaymentStatus.FAILED`**: accepts one `pgEnum` migration so cancelled unpaid COD orders remain semantically distinct from failed PayOS gateway transactions in `#29` payment ledgers.
- **Natural DB `FOR UPDATE` idempotency on `POST /orders/:id/confirm` over `@Idempotent()` Redis 24h caching**: avoids stale cached `confirmed` responses after later `packing`/`cancelled` transitions and handles multi-staff retries with distinct keys, at the cost of executing one short DB row lock on replay.
- **Single-statement `WHERE product_id IN (...) ORDER BY id ASC FOR UPDATE` over per-item batch locking or `SKIP LOCKED`**: eliminates `40P01` deadlocks on crossed-item orders without risking false `409 INSUFFICIENT_STOCK` from skipped locked rows, trading brief per-SKU serialization for strict FEFO determinism.
- **Soft-release (`batch_allocations.released_at` + partial unique index) over hard-deleting `batch_allocations` on cancel**: preserves allocation audit history in PostgreSQL at the cost of requiring `WHERE released_at IS NULL` predicates in all active-allocation readers (`#86`, `#87`).
- **`StaffOrderDto` over adding optional `allocations` to `OrderDto`**: preserves `ADR-0032` closed customer projections without leaking batch codes into storefront OpenAPI models, at the cost of maintaining a separate staff response schema.
