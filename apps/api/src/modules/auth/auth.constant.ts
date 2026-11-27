/**
 * Maximum number of non-expired active sessions returned per customer session listing request.
 */
export const MAX_ACTIVE_SESSIONS_LIST = 50;

/**
 * HttpOnly cookie name carrying the staff surface refresh token for Backoffice SPA.
 */
export const STAFF_REFRESH_COOKIE = "gr_staff_refresh";

/**
 * Cookie path scoping staff refresh token transmission to auth endpoints only.
 */
export const STAFF_REFRESH_COOKIE_PATH = "/api/v1/auth";

/**
 * Staff refresh cookie lifetime in milliseconds (7 days, matching refresh token TTL).
 */
export const STAFF_REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
