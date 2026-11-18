/**
 * Centralized route and Swagger tag constants for the Auth Module.
 * Conforms to docs/standards/api-design-and-error-handling.md §9.1 and ADR-0005.
 */
export const AUTH_ROUTES = {
  TAG: "auth",
  BASE: "auth",
  REGISTER: "register",
  VERIFY_EMAIL: "verify-email",
  RESEND_VERIFICATION: "resend-verification",
  LOGIN: "login",
  REFRESH: "refresh",
  LOGOUT: "logout",
  LOGOUT_ALL: "logout-all",
  FORGOT_PASSWORD: "forgot-password",
  RESET_PASSWORD: "reset-password",
} as const;
