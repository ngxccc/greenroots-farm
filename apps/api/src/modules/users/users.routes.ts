/**
 * Centralized route and Swagger tag constants for the Users Module.
 * Conforms to docs/standards/api-design-and-error-handling.md §8.
 */
export const USERS_ROUTES = Object.freeze({
  TAG: "users",
  BASE: "users",
  ME: "me",
  ADDRESSES: "me/addresses",
  ADDRESS_BY_ID: "me/addresses/:id",
  ADDRESS_DEFAULT: "me/addresses/:id/default",
  ADMIN_TAG: "admin-users",
  ADMIN_BASE: "admin/users",
  ADMIN_BY_ID: ":id",
  ADMIN_RESET_CREDENTIALS: ":id/reset-credentials",
} as const);
