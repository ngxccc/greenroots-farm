/**
 * Centralized route and Swagger tag constants for the Auth Module.
 * Conforms to docs/standards/api-design-and-error-handling.md §8, ADR-0015, and ADR-0016.
 */
export const AUTH_ROUTES = {
  TAG: "auth",
  BASE: "auth",
  REGISTER: "register",
  VERIFY_EMAIL: "verify-email",
  RESEND_VERIFICATION: "resend-verification",
  CUSTOMER_LOGIN: "customer/login",
  STAFF_LOGIN: "staff/login",
  CUSTOMER_REFRESH: "customer/refresh",
  STAFF_REFRESH: "staff/refresh",
  LOGOUT: "logout",
  LOGOUT_ALL: "logout-all",
  FORGOT_PASSWORD: "forgot-password",
  RESET_PASSWORD: "reset-password",
} as const;
