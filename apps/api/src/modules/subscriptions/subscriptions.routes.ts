/**
 * Centralized route and Swagger tag constants for the Subscriptions Module.
 * Conforms to docs/standards/api-design-and-error-handling.md §8.
 */
export const SUBSCRIPTION_PLANS_ROUTES = Object.freeze({
  TAG: "subscription-plans",
  BASE: "subscription-plans",
  ADMIN: "admin",
  BY_ID: ":id",
} as const);

export const SUBSCRIPTIONS_ROUTES = Object.freeze({
  TAG: "subscriptions",
  BASE: "subscriptions",
  ME: "me",
  BY_ID: ":id",
  CANCEL: ":id/cancel",
} as const);
