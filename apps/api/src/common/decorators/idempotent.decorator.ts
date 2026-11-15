import { SetMetadata } from "@nestjs/common";

export const IDEMPOTENT_METADATA_KEY = "IDEMPOTENT_METADATA_KEY";

export interface IdempotentOptions {
  /**
   * Whether the Idempotency-Key header is strictly required on this route.
   * If true and the header is missing, rejects with 400 Bad Request.
   * Default: false (pass-through when header is omitted).
   */
  required?: boolean;

  /**
   * Custom cache time-to-live in seconds.
   * Default: 86400 (24 hours).
   */
  ttlSeconds?: number;
}

/**
 * Marks a controller endpoint as idempotent, protecting against duplicate mutations
 * and returning cached responses for identical payloads within the TTL window.
 */
export const Idempotent = (options: IdempotentOptions = {}) =>
  SetMetadata(IDEMPOTENT_METADATA_KEY, options);
