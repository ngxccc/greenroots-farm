/**
 * Runtime environments supported by the API process.
 *
 * Kept as a named constant so the Zod schema and future tooling share one
 * source instead of duplicating the literal union inline.
 */
export const NODE_ENVIRONMENTS = ["development", "production", "test"] as const;

export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

/**
 * Log levels supported by the API process and NestJS Logger.
 *
 * Ordered progressively from most critical (`fatal`) to most verbose (`verbose`).
 */
export const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "log",
  "debug",
  "verbose",
] as const;

export type ApiLogLevel = (typeof LOG_LEVELS)[number];

/**
 * Mail delivery driver choices for the API process.
 */
export const MAIL_DRIVERS = ["resend", "mock"] as const;

export type MailDriver = (typeof MAIL_DRIVERS)[number];

/**
 * Payment gateway driver choices for the API process.
 */
export const PAYMENT_DRIVERS = ["payos", "mock"] as const;

export type PaymentDriver = (typeof PAYMENT_DRIVERS)[number];

/**
 * Shipping calculation driver choices for the API process.
 */
export const SHIPPING_DRIVERS = ["haversine"] as const;

export type ShippingDriverKind = (typeof SHIPPING_DRIVERS)[number];

/**
 * Resolves the active NestJS log levels for a given threshold.
 *
 * NestJS requires an explicit array of enabled levels (`LogLevel[]`). Passing a
 * single level string disables higher-severity output (e.g. `['warn']` would
 * silence `error` and `fatal`). This helper returns the progressive window up to
 * the selected threshold.
 */
export function resolveLogLevels(level: ApiLogLevel): ApiLogLevel[] {
  const index = LOG_LEVELS.indexOf(level);
  if (index === -1) {
    return ["fatal", "error", "warn", "log", "debug"];
  }
  return LOG_LEVELS.slice(0, index + 1);
}
