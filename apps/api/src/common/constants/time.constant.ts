/**
 * Time duration constants in seconds and milliseconds.
 * Eliminates magic numbers and repetitive arithmetic across the codebase.
 */
export const TIME_IN_SECONDS = {
  SECOND: 1,
  MINUTE: 60,
  HOUR: 60 * 60,
  DAY: 24 * 60 * 60,
  WEEK: 7 * 24 * 60 * 60,
} as const;

export const TIME_IN_MS = {
  SECOND: 1_000,
  MINUTE: 60 * 1_000,
  HOUR: 60 * 60 * 1_000,
  DAY: 24 * 60 * 60 * 1_000,
  WEEK: 7 * 24 * 60 * 60 * 1_000,
} as const;
