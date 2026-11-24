import { FarmingActionType, SeasonStatus } from "@greenroots/shared";

/**
 * Runtime constants and derived sort unions for the Farms Module (`ADR-0035`).
 */

/** Redis cache key storing the serialized singleton farm settings payload. */
export const FARM_SETTINGS_CACHE_KEY = "farm:settings:v1";

/** Short-lived Redis marker recording the latest cache invalidation timestamp in ms. */
export const FARM_SETTINGS_INVALIDATED_AT_KEY = "farm:settings:invalidated_at";

/** 24-hour TTL for cached farm settings in seconds. */
export const FARM_SETTINGS_CACHE_TTL_SECONDS = 86_400;

/** 60-second TTL for the stale-backfill guard marker after an update. */
export const FARM_SETTINGS_INVALIDATION_MARKER_TTL_SECONDS = 60;

/**
 * Whitelisted sort expressions for `GET /api/v1/plots`.
 */
export const PLOT_SORT_OPTIONS = [
  "createdAt:desc",
  "createdAt:asc",
  "plotCode:asc",
  "plotCode:desc",
  "areaSqm:asc",
  "areaSqm:desc",
] as const;

/**
 * Union of supported sort query strings for the plots listing endpoint.
 */
export type PlotSortOption = (typeof PLOT_SORT_OPTIONS)[number];

/**
 * Whitelisted sort expressions for `GET /api/v1/seasons`.
 */
export const SEASON_SORT_OPTIONS = [
  "createdAt:desc",
  "createdAt:asc",
  "startDate:desc",
  "startDate:asc",
  "expectedHarvestDate:asc",
  "expectedHarvestDate:desc",
] as const;

/**
 * Union of supported sort query strings for the seasons listing endpoint.
 */
export type SeasonSortOption = (typeof SEASON_SORT_OPTIONS)[number];

/**
 * Linear forward-only status transition matrix for cultivation seasons.
 */
export const SEASON_ALLOWED_TRANSITIONS: Record<
  SeasonStatus,
  readonly SeasonStatus[]
> = Object.freeze({
  [SeasonStatus.PLANNING]: [SeasonStatus.ACTIVE],
  [SeasonStatus.ACTIVE]: [SeasonStatus.HARVESTED],
  [SeasonStatus.HARVESTED]: [SeasonStatus.COMPLETED],
  [SeasonStatus.COMPLETED]: [],
});

/**
 * Whitelisted sort expressions for `GET /api/v1/seasons/:id/logs`.
 */
export const FARMING_LOG_SORT_OPTIONS = [
  "loggedAt:desc",
  "loggedAt:asc",
] as const;

/**
 * Union of supported sort query strings for the farming logs listing endpoint.
 */
export type FarmingLogSortOption = (typeof FARMING_LOG_SORT_OPTIONS)[number];

const ALL_FARMING_ACTION_TYPES: readonly FarmingActionType[] =
  Object.values(FarmingActionType);

/**
 * Allowed farming action types per persisted cultivation season status.
 */
export const SEASON_ALLOWED_FARMING_ACTIONS: Record<
  SeasonStatus,
  readonly FarmingActionType[]
> = Object.freeze({
  [SeasonStatus.PLANNING]: [
    FarmingActionType.SOIL_TESTING,
    FarmingActionType.CORRECTION,
  ],
  [SeasonStatus.ACTIVE]: ALL_FARMING_ACTION_TYPES,
  [SeasonStatus.HARVESTED]: ALL_FARMING_ACTION_TYPES,
  [SeasonStatus.COMPLETED]: [FarmingActionType.CORRECTION],
});

/** Redis key prefix storing serialized public batch trace envelopes. */
export const TRACE_CACHE_PREFIX = "trace:batch:v1:";

/** Redis key prefix storing short-lived negative-cache markers for missing batch codes. */
export const TRACE_MISS_CACHE_PREFIX = "trace:batch:miss:v1:";

/** Redis key prefix recording the latest per-batch invalidation timestamp in ms. */
export const TRACE_INVALIDATED_AT_PREFIX = "trace:batch:invalidated_at:";

/** Redis key storing the current farm-wide invalidation epoch UUID nonce. */
export const TRACE_FARM_VERSION_KEY = "trace:farm_ver:v1";

/** 15-minute safety-net TTL for cached public batch trace records in seconds. */
export const TRACE_CACHE_TTL_SECONDS = 900;

/** 30-second negative-cache TTL for syntactically valid missing batch codes. */
export const TRACE_MISS_TTL_SECONDS = 30;

/** 60-second TTL for per-batch stale-backfill guard markers after invalidation. */
export const TRACE_INVALIDATION_MARKER_TTL_SECONDS = 60;

/** Redis key prefix storing serialized public recent trace batch lists. */
export const TRACE_RECENT_CACHE_PREFIX = "trace:recent:v1:";

/** 60-second TTL for cached public recent trace batch lists in seconds. */
export const TRACE_RECENT_CACHE_TTL_SECONDS = 60;

/** Default number of recent harvested batches returned by `GET /api/v1/trace`. */
export const TRACE_RECENT_DEFAULT_LIMIT = 4;

/** Maximum number of recent harvested batches allowed by `GET /api/v1/trace`. */
export const TRACE_RECENT_MAX_LIMIT = 12;

/** Maximum chronological farming log entries included in a single public trace payload. */
export const TRACE_MAX_FARMING_LOGS = 200;

/** Canonical batch code path format enforced after uppercase trimming. */
export const BATCH_CODE_REGEX = /^[A-Z0-9][A-Z0-9_-]{2,99}$/;
