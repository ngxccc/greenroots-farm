/**
 * Standard successful API response envelope.
 */
export interface ApiResponse<T, M = unknown> {
  success: true;
  data: T;
  meta?: M;
}

/**
 * Wraps a successful controller payload in the repository-standard envelope.
 *
 * @param data Primary resource payload.
 * @param meta Optional root-level metadata (for example pagination).
 */
export function apiSuccess<T, M = unknown>(
  data: T,
  meta?: M,
): ApiResponse<T, M> {
  return meta === undefined
    ? { success: true, data }
    : { success: true, data, meta };
}
