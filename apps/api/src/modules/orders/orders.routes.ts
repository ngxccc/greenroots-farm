/**
 * Centralized route and Swagger tag constants for the Orders module.
 * Conforms to docs/standards/api-design-and-error-handling.md §8.
 */
export const ORDERS_ROUTES = Object.freeze({
  TAG: "orders",
  BASE: "orders",
  VALIDATE_CART: "validate-cart",
  CHECKOUT: "checkout",
  ME: "me",
  BY_ID: ":id",
  CONFIRM: ":id/confirm",
  STATUS: ":id/status",
  PICK_LIST: ":id/pick-list",
} as const);
