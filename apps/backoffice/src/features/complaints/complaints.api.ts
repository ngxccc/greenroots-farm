import { api, extractApiErrorMessage } from "@/lib/api-client";
import type {
  ComplaintOrderDetailDto,
  ComplaintStatusFilter,
  ResolveComplaintDto,
  StaffComplaintDto,
  TriageComplaintDto,
} from "./complaints.utils";

/** TanStack Query cache keys for backoffice customer complaints. */
export const COMPLAINTS_QUERY_KEYS = {
  all: ["complaints"] as const,
  list: (params: StaffComplaintsQueryParams) =>
    ["complaints", "list", params] as const,
  orderDetail: (orderId: string) =>
    ["complaints", "order-detail", orderId] as const,
};

/** Query parameters supported by `GET /api/v1/complaints`. */
export interface StaffComplaintsQueryParams {
  readonly status?: ComplaintStatusFilter;
  readonly search?: string;
  readonly page?: number;
  readonly limit?: number;
}

/**
 * Typed API error preserving HTTP status and RFC 9457 error code for inline alerts.
 */
export class ComplaintsApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ComplaintsApiError";
    this.status = status;
    this.code = code;
  }
}

function toComplaintsApiError(
  error: unknown,
  status: number,
  fallback: string,
): ComplaintsApiError {
  const message = extractApiErrorMessage(error, fallback);
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;
  return new ComplaintsApiError(message, status, code);
}

/**
 * Fetches paginated staff complaints with status and search filters.
 */
export async function fetchStaffComplaints(
  params: StaffComplaintsQueryParams,
): Promise<{
  readonly items: StaffComplaintDto[];
  readonly total: number;
  readonly page: number;
  readonly totalPages: number;
}> {
  const trimmedSearch = params.search?.trim();

  const { data, error, response } = await api.GET("/api/v1/complaints", {
    params: {
      query: {
        status:
          params.status && params.status !== "all" ? params.status : undefined,
        ...(trimmedSearch ? { search: trimmedSearch } : {}),
        page: params.page ?? 1,
        limit: params.limit ?? 20,
      },
    },
  });

  if (error) {
    throw toComplaintsApiError(
      error,
      response.status,
      "Không thể tải danh sách khiếu nại.",
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
 * Fetches the parent order detail for a complaint so affected items can be inspected
 * or selected during partial replacement resolution.
 */
export async function fetchComplaintOrderDetail(
  orderId: string,
): Promise<ComplaintOrderDetailDto> {
  const { data, error, response } = await api.GET("/api/v1/orders/{id}", {
    params: { path: { id: orderId } },
  });

  if (error) {
    throw toComplaintsApiError(
      error,
      response.status,
      "Không thể tải chi tiết sản phẩm của đơn hàng gốc.",
    );
  }

  return data.data;
}

/**
 * Triages or rejects a customer complaint (`PATCH /api/v1/complaints/{id}/triage`).
 */
export async function triageComplaint(
  complaintId: string,
  payload: TriageComplaintDto,
): Promise<StaffComplaintDto> {
  const { data, error, response } = await api.PATCH(
    "/api/v1/complaints/{id}/triage",
    {
      params: { path: { id: complaintId } },
      body: payload,
    },
  );

  if (error) {
    throw toComplaintsApiError(
      error,
      response.status,
      "Không thể cập nhật phân loại khiếu nại.",
    );
  }

  return data.data;
}

/**
 * Atomically resolves a triaged complaint via refund or 0đ FEFO replacement order
 * (`POST /api/v1/complaints/{id}/resolve`).
 */
export async function resolveComplaint(
  complaintId: string,
  payload: ResolveComplaintDto,
  idempotencyKey: string,
): Promise<StaffComplaintDto> {
  const { data, error, response } = await api.POST(
    "/api/v1/complaints/{id}/resolve",
    {
      params: {
        path: { id: complaintId },
        header: { "Idempotency-Key": idempotencyKey },
      },
      body: payload,
    },
  );

  if (error) {
    throw toComplaintsApiError(
      error,
      response.status,
      "Không thể xử lý bồi hoàn cho khiếu nại.",
    );
  }

  return data.data;
}
