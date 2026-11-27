import { api, extractApiErrorMessage } from "@/lib/api-client";
import type {
  BatchDto,
  NearExpiryBatchDto,
  ToggleBatchFlashSaleDto,
} from "./expiry-utils";

/** TanStack Query cache keys for near-expiry batch monitoring and Flash Sale. */
export const EXPIRY_QUERY_KEYS = {
  all: ["inventory", "near-expiry"] as const,
  list: (params: NearExpiryQueryParams) =>
    ["inventory", "near-expiry", "list", params] as const,
};

/**
 * Query parameters supported by `GET /api/v1/inventory/near-expiry`.
 */
export interface NearExpiryQueryParams {
  readonly page?: number;
  readonly limit?: number;
}

/**
 * Fetches paginated FEFO-ordered near-expiry batches within the farm's threshold.
 *
 * @param params Pagination parameters (`page`, `limit`).
 * @returns Paginated near-expiry batch list and metadata.
 */
export async function fetchNearExpiryBatches(
  params: NearExpiryQueryParams,
): Promise<{
  readonly items: NearExpiryBatchDto[];
  readonly total: number;
  readonly page: number;
  readonly totalPages: number;
}> {
  const { data, error } = await api.GET("/api/v1/inventory/near-expiry", {
    params: {
      query: {
        page: params.page ?? 1,
        limit: params.limit ?? 20,
      },
    },
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể tải danh sách lô hàng cận hạn."),
    );
  }

  return {
    items: data.data,
    total: data.meta.total,
    page: data.meta.page,
    totalPages: data.meta.totalPages,
  };
}

/**
 * Toggles Rescue Flash Sale status and discount percentage on a batch.
 *
 * @param id Batch UUIDv7 identifier.
 * @param payload Flash Sale toggle state and optional integer discount percent (1-90).
 * @returns Updated batch DTO.
 */
export async function toggleBatchFlashSale(
  id: string,
  payload: ToggleBatchFlashSaleDto,
): Promise<BatchDto> {
  const { data, error } = await api.PATCH("/api/v1/batches/{id}/flash-sale", {
    params: {
      path: { id },
    },
    body: payload,
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(
        error,
        "Không thể cập nhật trạng thái Flash Sale cho lô hàng.",
      ),
    );
  }

  return data.data;
}
