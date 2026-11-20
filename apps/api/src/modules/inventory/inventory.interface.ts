import { SeasonStatus } from "@greenroots/shared";

/**
 * Compile-time constants and types for the Inventory Module.
 * Runtime Zod schemas live in `dto/` per ADR-0011.
 */

/** Whitelisted sort expressions for `GET /api/v1/batches`. */
export const BATCH_SORT_OPTIONS = [
  "createdAt:desc",
  "createdAt:asc",
  "expirationDate:asc",
  "expirationDate:desc",
  "harvestDate:desc",
  "harvestDate:asc",
] as const;

/** Union of supported sort query strings for the batches listing endpoint. */
export type BatchSortOption = (typeof BATCH_SORT_OPTIONS)[number];

/** Cultivation season statuses permitting batch creation at harvest intake. */
export const ALLOWED_BATCH_INTAKE_SEASON_STATUSES: readonly SeasonStatus[] = [
  SeasonStatus.ACTIVE,
  SeasonStatus.HARVESTED,
] as const;

/** Maximum transaction attempts when retrying a PG `23505` batch code collision. */
export const BATCH_CODE_MAX_GENERATION_ATTEMPTS = 3;

/** Maximum shelf-life duration accepted at batch intake (10 years). */
export const BATCH_MAX_SHELF_LIFE_DAYS = 3650;

/** Upper bound matching `numeric(10, 2)` precision on `batches` quantities. */
export const BATCH_MAX_QUANTITY = 99_999_999.99;

/** Minimum positive two-decimal quantity allowed at batch intake. */
export const BATCH_MIN_QUANTITY = 0.01;

/** Length of the cryptographic random suffix in server-generated batch codes. */
export const BATCH_CODE_RANDOM_LENGTH = 6;

/** Crockford Base32 alphabet omitting visually ambiguous characters (`I`, `L`, `O`, `U`). */
export const CROCKFORD_BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Canonical farm timezone for calendar-date comparisons against `seasons.startDate`. */
export const VIETNAM_TIMEZONE = "Asia/Ho_Chi_Minh";
