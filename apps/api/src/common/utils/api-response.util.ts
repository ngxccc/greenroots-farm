import type { PaginationMetaDto } from "../dto/api-response.dto";

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

/**
 * Constructs pagination metadata from query and total count.
 *
 * @param total Total number of records matching query.
 * @param page Current page index (1-based).
 * @param limit Number of records per page.
 */
export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMetaDto {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}
