/**
 * Runtime constants and derived sort unions for the Users Module (`ADR-0035`).
 */

/**
 * Whitelisted sort expressions for `GET /api/v1/admin/users`.
 */
export const STAFF_SORT_OPTIONS = [
  "createdAt:desc",
  "createdAt:asc",
  "fullName:asc",
  "fullName:desc",
  "email:asc",
  "email:desc",
] as const;

/**
 * Union of supported sort query strings for the staff directory.
 */
export type StaffSortOption = (typeof STAFF_SORT_OPTIONS)[number];
