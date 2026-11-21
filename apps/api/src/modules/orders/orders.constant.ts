import { OrderStatus, UserRole } from "@greenroots/shared";

/**
 * Runtime domain constants and derived tuple unions for `OrdersModule` (`ADR-0035`).
 */

/** Whitelisted sort expressions for `GET /api/v1/orders/me`. */
export const ORDER_SORT_OPTIONS = [
  "createdAt:desc",
  "createdAt:asc",
  "totalAmount:desc",
  "totalAmount:asc",
] as const;

/** Union of supported sort query strings for customer order history. */
export type OrderSortOption = (typeof ORDER_SORT_OPTIONS)[number];

export const ORDER_CODE_PREFIX = "ORD";
export const ORDER_CODE_RANDOM_LENGTH = 6;
export const ORDER_CODE_MAX_GENERATION_ATTEMPTS = 5;
export const ORDER_ITEM_MIN_QUANTITY = 0.01;
export const ORDER_ITEM_MAX_QUANTITY = 10_000;
export const MAX_CART_LINE_ITEMS = 50;

/**
 * Canonical per-item validation issues surfaced by `POST /api/v1/orders/validate-cart`.
 */
export const CART_ITEM_ISSUES = [
  "PRODUCT_UNAVAILABLE",
  "INSUFFICIENT_STOCK",
] as const;

/**
 * Diagnostic issue union for an unavailable or stock-short cart line item.
 */
export type CartItemIssue = (typeof CART_ITEM_ISSUES)[number];

/**
 * Allowed target statuses for `PATCH /api/v1/orders/:id/status` keyed by current status (`ADR-0033`).
 * Direct transitions into `confirmed` are excluded and must go through `POST /api/v1/orders/:id/confirm`.
 */
export const ORDER_STATUS_TRANSITIONS: ReadonlyMap<
  OrderStatus,
  readonly OrderStatus[]
> = new Map<OrderStatus, readonly OrderStatus[]>([
  [OrderStatus.PENDING_PAYMENT, [OrderStatus.CANCELLED]],
  [OrderStatus.PENDING_CONFIRMATION, [OrderStatus.CANCELLED]],
  [OrderStatus.CONFIRMED, [OrderStatus.PACKING, OrderStatus.CANCELLED]],
  [OrderStatus.PACKING, [OrderStatus.SHIPPING, OrderStatus.CANCELLED]],
  [OrderStatus.SHIPPING, [OrderStatus.DELIVERED]],
  [OrderStatus.DELIVERED, [OrderStatus.COMPLETED]],
  [OrderStatus.COMPLETED, []],
  [OrderStatus.CANCELLED, []],
]);

/** Order statuses that hold active FEFO allocations requiring stock restoration upon cancellation. */
export const ALLOCATED_CANCELLABLE_STATUSES: readonly OrderStatus[] =
  Object.freeze([OrderStatus.CONFIRMED, OrderStatus.PACKING]);

/** Order statuses eligible to render an active warehouse pick list (`#87`, `ADR-0033`). */
export const PICK_LIST_ALLOWED_STATUSES = [
  OrderStatus.CONFIRMED,
  OrderStatus.PACKING,
  OrderStatus.SHIPPING,
] as const;

/** Narrowed order status union eligible to render an active warehouse pick list. */
export type PickListOrderStatus = (typeof PICK_LIST_ALLOWED_STATUSES)[number];

/** Staff roles authorized to confirm orders and manage fulfillment status transitions. */
export const FULFILLMENT_ALLOWED_ROLES = Object.freeze([
  UserRole.SALES,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
] as const);
