/**
 * Centralized route and Swagger tag constants for the Users Module.
 * Conforms to docs/standards/api-design-and-error-handling.md §8.
 */
export const USERS_ROUTES = {
  TAG: "users",
  BASE: "users",
  ME: "me",
  ADDRESSES: "me/addresses",
  ADDRESS_BY_ID: "me/addresses/:id",
  ADDRESS_DEFAULT: "me/addresses/:id/default",
} as const;
