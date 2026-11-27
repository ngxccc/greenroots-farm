import type { WasteLogStatus } from "@greenroots/shared";
import { api, extractApiErrorMessage } from "@/lib/api-client";
import type { RejectWasteLogDto, WasteLogDto } from "./waste-utils";

/** TanStack Query cache keys for waste write-off review. */
export const WASTE_QUERY_KEYS = {
  all: ["inventory", "waste-logs"] as const,
  list: (params: WasteLogsQueryParams) =>
    ["inventory", "waste-logs", "list", params] as const,
  detail: (id: string) => ["inventory", "waste-logs", "detail", id] as const,
};

/**
 * Query parameters supported by `GET /api/v1/waste-logs`.
 */
export interface WasteLogsQueryParams {
  readonly status?: WasteLogStatus;
  readonly search?: string;
  readonly page?: number;
  readonly limit?: number;
  readonly sort?:
    | "createdAt:desc"
    | "createdAt:asc"
    | "discardedQuantity:desc"
    | "discardedQuantity:asc";
}

/**
 * Fetches paginated waste write-off proposals for review.
 */
export async function fetchWasteLogs(params: WasteLogsQueryParams): Promise<{
  readonly items: WasteLogDto[];
  readonly total: number;
  readonly page: number;
  readonly totalPages: number;
}> {
  const { data, error } = await api.GET("/api/v1/waste-logs", {
    params: {
      query: {
        status: params.status,
        search: params.search,
        page: params.page ?? 1,
        limit: params.limit ?? 20,
        sort: params.sort ?? "createdAt:desc",
      },
    },
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể tải danh sách phiếu xuất hủy."),
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
 * Atomically approves a pending waste write-off proposal and deducts batch stock.
 */
export async function approveWasteLog(
  id: string,
  idempotencyKey: string,
): Promise<WasteLogDto> {
  const { data, error } = await api.POST("/api/v1/waste-logs/{id}/approve", {
    params: {
      path: { id },
      header: { "Idempotency-Key": idempotencyKey },
    },
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể phê duyệt phiếu xuất hủy."),
    );
  }

  return data.data;
}

/**
 * Atomically rejects a pending waste write-off proposal with a mandatory reason.
 */
export async function rejectWasteLog(
  id: string,
  payload: RejectWasteLogDto,
  idempotencyKey: string,
): Promise<WasteLogDto> {
  const { data, error } = await api.POST("/api/v1/waste-logs/{id}/reject", {
    params: {
      path: { id },
      header: { "Idempotency-Key": idempotencyKey },
    },
    body: payload,
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể từ chối phiếu xuất hủy."),
    );
  }

  return data.data;
}
