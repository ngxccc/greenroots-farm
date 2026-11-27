import { BatchStatus, SeasonStatus } from "@greenroots/shared";
import { TIME_IN_MS } from "@/common/constants/time.constant";

/**
 * Runtime constants and derived sort unions for the Inventory Module (`ADR-0035`).
 */

/** Interval between periodic batch expiry and near-expiry sweeps (5 minutes). */
export const BATCH_EXPIRY_SWEEP_INTERVAL_MS = 5 * TIME_IN_MS.MINUTE;

/** Maximum batch rows claimed per `FOR UPDATE SKIP LOCKED` sweep chunk (`INV-BEXP-4`). */
export const BATCH_EXPIRY_SWEEP_BATCH_SIZE = 500;

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

/** Whitelisted sort expressions for `GET /api/v1/waste-logs`. */
export const WASTE_LOG_SORT_OPTIONS = [
  "createdAt:desc",
  "createdAt:asc",
  "discardedQuantity:desc",
  "discardedQuantity:asc",
] as const;

/** Union of supported sort query strings for the waste logs listing endpoint. */
export type WasteLogSortOption = (typeof WASTE_LOG_SORT_OPTIONS)[number];

/** Cultivation season statuses permitting batch creation at harvest intake. */
export const ALLOWED_BATCH_INTAKE_SEASON_STATUSES: readonly SeasonStatus[] =
  Object.freeze([SeasonStatus.ACTIVE, SeasonStatus.HARVESTED]);

/** Batch statuses eligible for waste write-off proposals while stock remains positive. */
export const ELIGIBLE_WASTE_BATCH_STATUSES: readonly BatchStatus[] =
  Object.freeze([
    BatchStatus.IN_STOCK,
    BatchStatus.NEAR_EXPIRY,
    BatchStatus.EXPIRED,
  ]);

/** Minimum Cloudinary proof images required on a waste log proposal. */
export const WASTE_LOG_MIN_MEDIA_ITEMS = 1;

/** Maximum Cloudinary proof images allowed on a waste log proposal. */
export const WASTE_LOG_MAX_MEDIA_ITEMS = 3;

/** Maximum character length for a waste proposal reason (`waste_logs.reason`). */
export const WASTE_LOG_REASON_MAX_LENGTH = 255;

/** Maximum character length for an admin rejection reason (`waste_logs.rejection_reason`). */
export const WASTE_LOG_REJECTION_REASON_MAX_LENGTH = 500;

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

/** Minimum allowed percentage discount for a batch-level Rescue Flash Sale. */
export const FLASH_SALE_DISCOUNT_MIN = 1;

/** Maximum allowed percentage discount for a batch-level Rescue Flash Sale. */
export const FLASH_SALE_DISCOUNT_MAX = 99;
