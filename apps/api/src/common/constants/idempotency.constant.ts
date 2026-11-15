/**
 * Idempotency configuration and Redis storage constants.
 */
export const IDEMPOTENCY_HEADER_NAME = "Idempotency-Key";

export const IDEMPOTENCY_KEY_PREFIX = "idempotency:";

/** Short-lived distributed mutex TTL while mutation is being processed (60 seconds). */
export const PROCESSING_LOCK_TTL_SECONDS = 60;

/** Completed response cache retention window (24 hours). */
export const COMPLETED_CACHE_TTL_SECONDS = 86_400;

export const IDEMPOTENCY_STATUS = {
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
} as const;

export type IdempotencyStatus =
  (typeof IDEMPOTENCY_STATUS)[keyof typeof IDEMPOTENCY_STATUS];

export const UUID_V4_OR_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
