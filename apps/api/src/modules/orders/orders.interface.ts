/**
 * Pure domain constants and internal interfaces for `OrdersModule` (`ADR-0011`).
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
export const VIETNAM_TIMEZONE = "Asia/Ho_Chi_Minh";
export const CROCKFORD_BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

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
 * Normalized cart line item deduplicated by `productId` using integer-cent quantities.
 */
export interface NormalizedCartItem {
  readonly productId: string;
  readonly quantityCents: number;
  readonly quantity: number;
  readonly quantityFormatted: string;
}
