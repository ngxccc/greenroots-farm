import type { OrderStatus } from "@greenroots/shared";
import { api, extractApiErrorMessage } from "@/lib/api-client";
import type {
  OrderPickListDto,
  OrderStatusFilter,
  StaffOrderDto,
  SubscriptionFilter,
} from "./orders.utils";

/** TanStack Query cache keys for backoffice fulfillment orders. */
export const ORDERS_QUERY_KEYS = {
  all: ["orders"] as const,
  list: (params: StaffOrdersQueryParams) => ["orders", "list", params] as const,
  pickList: (orderId: string) => ["orders", "pick-list", orderId] as const,
};

/**
 * Query parameters supported by `GET /api/v1/orders`.
 */
export interface StaffOrdersQueryParams {
  readonly status?: OrderStatusFilter;
  readonly subscription?: SubscriptionFilter;
  readonly search?: string;
  readonly page?: number;
  readonly limit?: number;
  readonly sort?:
    | "createdAt:desc"
    | "createdAt:asc"
    | "totalAmount:desc"
    | "totalAmount:asc";
}

/**
 * Typed API error preserving HTTP status and RFC 9457 error code for inline alerts.
 */
export class OrdersApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "OrdersApiError";
    this.status = status;
    this.code = code;
  }
}

function toOrdersApiError(
  error: unknown,
  status: number,
  fallback: string,
): OrdersApiError {
  const message = extractApiErrorMessage(error, fallback);
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;
  return new OrdersApiError(message, status, code);
}

/**
 * Fetches paginated staff fulfillment orders with status, subscription, and search filters.
 */
export async function fetchStaffOrders(
  params: StaffOrdersQueryParams,
): Promise<{
  readonly items: StaffOrderDto[];
  readonly total: number;
  readonly page: number;
  readonly totalPages: number;
}> {
  const isSubscription =
    params.subscription === "subscription"
      ? "true"
      : params.subscription === "retail"
        ? "false"
        : undefined;

  const trimmedSearch = params.search?.trim();

  const { data, error, response } = await api.GET("/api/v1/orders", {
    params: {
      query: {
        status:
          params.status && params.status !== "all" ? params.status : undefined,
        isSubscription,
        ...(trimmedSearch ? { search: trimmedSearch } : {}),
        page: params.page ?? 1,
        limit: params.limit ?? 20,
        sort: params.sort ?? "createdAt:desc",
      },
    },
  });

  if (error) {
    throw toOrdersApiError(
      error,
      response.status,
      "Không thể tải danh sách đơn hàng.",
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
 * Atomically confirms a pending order and locks FEFO batch allocations (`POST /api/v1/orders/:id/confirm`).
 */
export async function confirmOrderFefo(
  orderId: string,
  idempotencyKey: string,
): Promise<StaffOrderDto> {
  const { data, error, response } = await api.POST(
    "/api/v1/orders/{id}/confirm",
    {
      params: { path: { id: orderId } },
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );

  if (error) {
    throw toOrdersApiError(
      error,
      response.status,
      "Không thể xác nhận đơn hàng và phân bổ FEFO.",
    );
  }

  return data.data;
}

/**
 * Transitions an order along the valid `OrderStatus` FSM (`PATCH /api/v1/orders/:id/status`).
 */
export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<StaffOrderDto> {
  const { data, error, response } = await api.PATCH(
    "/api/v1/orders/{id}/status",
    {
      params: { path: { id: orderId } },
      body: { status },
    },
  );

  if (error) {
    throw toOrdersApiError(
      error,
      response.status,
      "Không thể cập nhật trạng thái đơn hàng.",
    );
  }

  return data.data;
}

/**
 * Fetches the FEFO batch-grouped pick list for an eligible order (`GET /api/v1/orders/:id/pick-list`).
 */
export async function fetchOrderPickList(
  orderId: string,
): Promise<OrderPickListDto> {
  const { data, error, response } = await api.GET(
    "/api/v1/orders/{id}/pick-list",
    {
      params: { path: { id: orderId } },
    },
  );

  if (error) {
    throw toOrdersApiError(
      error,
      response.status,
      "Không thể tải phiếu soạn hàng FEFO.",
    );
  }

  return data.data;
}
