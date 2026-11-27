import type { BatchStatus } from "@greenroots/shared";
import { api, extractApiErrorMessage } from "@/lib/api-client";
import type {
  BatchDto,
  BatchQrLabelDto,
  CreateBatchDto,
  CreateWasteLogDto,
  ProductDto,
  SeasonDto,
  WasteLogDto,
} from "./batches.utils";

export interface FetchBatchesParams {
  readonly search?: string;
  readonly status?: BatchStatus;
}

/**
 * Fetches inventory batches with optional search and status filters.
 */
export async function fetchBatches(
  params: FetchBatchesParams = {},
): Promise<BatchDto[]> {
  const { data, error } = await api.GET("/api/v1/batches", {
    params: {
      query: {
        limit: 100,
        sort: "expirationDate:asc",
        ...(params.search?.trim() ? { search: params.search.trim() } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
    },
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể tải danh sách lô thu hoạch."),
    );
  }

  return data.data;
}

/**
 * Creates a harvested inventory batch with an `Idempotency-Key` header.
 */
export async function createBatch(
  body: CreateBatchDto,
  idempotencyKey: string,
): Promise<BatchDto> {
  const { data, error } = await api.POST("/api/v1/batches", {
    params: {
      header: {
        "Idempotency-Key": idempotencyKey,
      },
    },
    body,
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể tạo lô thu hoạch mới."),
    );
  }

  return data.data;
}

/**
 * Fetches the deterministic thermal QR label payload for an existing batch.
 */
export async function fetchBatchQrLabel(
  batchId: string,
): Promise<BatchQrLabelDto> {
  const { data, error } = await api.GET("/api/v1/batches/{id}/qr-label", {
    params: { path: { id: batchId } },
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể tải dữ liệu tem QR."),
    );
  }

  return data.data;
}

/**
 * Fetches waste write-off proposals visible to the current staff member.
 */
export async function fetchWasteLogs(): Promise<WasteLogDto[]> {
  const { data, error } = await api.GET("/api/v1/waste-logs", {
    params: {
      query: {
        limit: 100,
        sort: "createdAt:desc",
      },
    },
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể tải danh sách đề xuất hủy."),
    );
  }

  return data.data;
}

/**
 * Submits a pending waste write-off proposal with an `Idempotency-Key` header.
 */
export async function createWasteLog(
  body: CreateWasteLogDto,
  idempotencyKey: string,
): Promise<WasteLogDto> {
  const { data, error } = await api.POST("/api/v1/waste-logs", {
    params: {
      header: {
        "Idempotency-Key": idempotencyKey,
      },
    },
    body,
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể gửi đề xuất xuất hủy."),
    );
  }

  return data.data;
}

/**
 * Fetches active catalog products for batch harvest intake selection.
 */
export async function fetchActiveProducts(): Promise<ProductDto[]> {
  const { data, error } = await api.GET("/api/v1/products", {
    params: {
      query: {
        limit: 100,
        sort: "name:asc",
      },
    },
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể tải danh sách sản phẩm."),
    );
  }

  return data.data;
}

/**
 * Fetches cultivation seasons eligible for harvest batch intake (`active` or `harvested`).
 */
export async function fetchIntakeSeasons(): Promise<SeasonDto[]> {
  const { data, error } = await api.GET("/api/v1/seasons", {
    params: {
      query: {
        limit: 100,
        sort: "createdAt:desc",
      },
    },
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể tải danh sách mùa vụ."),
    );
  }

  return data.data.filter(
    (season) => season.status === "active" || season.status === "harvested",
  );
}
