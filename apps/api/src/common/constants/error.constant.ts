/**
 * PostgreSQL SQLSTATE codes mapped by the global exception filter.
 */
export const PG_ERROR_CODE = {
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  CHECK_VIOLATION: "23514",
  INVALID_TEXT_REPRESENTATION: "22P02",
  RAISE_EXCEPTION: "P0001",
  SERIALIZATION_FAILURE: "40001",
  DEADLOCK_DETECTED: "40P01",
  QUERY_CANCELED: "57014",
} as const;

/**
 * PostgreSQL error signature used by Drizzle's wrapped query errors.
 */
export interface DatabaseErrorDetails {
  isDatabaseError: boolean;
  code?: string;
  message?: string;
  detail?: string;
  table?: string;
  column?: string;
  constraint?: string;
}
