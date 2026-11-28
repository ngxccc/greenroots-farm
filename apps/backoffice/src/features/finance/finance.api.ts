import { api, extractApiErrorMessage } from "@/lib/api-client";
import type {
  CashflowGranularity,
  FinanceAnalyticsDto,
  PaymentLedgerItemDto,
  PaymentMethodFilter,
  PaymentStatusFilter,
  PaymentTransactionTypeFilter,
} from "./finance.utils";

/** TanStack Query cache keys for backoffice payment ledger and cashflow analytics. */
export const FINANCE_QUERY_KEYS = {
  all: ["finance"] as const,
  paymentsList: (params: PaymentLedgerQueryParams) =>
    ["finance", "payments", params] as const,
  cashflow: (params: FinanceAnalyticsQueryParams) =>
    ["finance", "cashflow", params] as const,
};

/** Query parameters supported by `GET /api/v1/payments`. */
export interface PaymentLedgerQueryParams {
  readonly page?: number;
  readonly limit?: number;
  readonly status?: PaymentStatusFilter;
  readonly paymentMethod?: PaymentMethodFilter;
  readonly transactionType?: PaymentTransactionTypeFilter;
  readonly search?: string;
}

/** Query parameters supported by `GET /api/v1/analytics/finance`. */
export interface FinanceAnalyticsQueryParams {
  readonly from?: string;
  readonly to?: string;
  readonly granularity?: CashflowGranularity;
}

/** Typed API error preserving HTTP status and RFC 9457 error code for inline alerts. */
export class FinanceApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "FinanceApiError";
    this.status = status;
    this.code = code;
  }
}

function toFinanceApiError(
  error: unknown,
  status: number,
  fallback: string,
): FinanceApiError {
  const message = extractApiErrorMessage(error, fallback);
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;
  return new FinanceApiError(message, status, code);
}

/**
 * Fetches paginated staff payment ledger rows with method, status, type, and search filters.
 */
export async function fetchPaymentLedger(
  params: PaymentLedgerQueryParams,
): Promise<{
  readonly items: PaymentLedgerItemDto[];
  readonly total: number;
  readonly page: number;
  readonly totalPages: number;
}> {
  const trimmedSearch = params.search?.trim();

  const { data, error, response } = await api.GET("/api/v1/payments", {
    params: {
      query: {
        page: params.page ?? 1,
        limit: params.limit ?? 20,
        status:
          params.status && params.status !== "all" ? params.status : undefined,
        paymentMethod:
          params.paymentMethod && params.paymentMethod !== "all"
            ? params.paymentMethod
            : undefined,
        transactionType:
          params.transactionType && params.transactionType !== "all"
            ? params.transactionType
            : undefined,
        ...(trimmedSearch ? { search: trimmedSearch } : {}),
      },
    },
  });

  if (error) {
    throw toFinanceApiError(
      error,
      response.status,
      "Không thể tải sổ cái thanh toán.",
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
 * Atomically settles a pending COD payment (`POST /api/v1/payments/:id/confirm-cod`).
 */
export async function confirmCodPayment(
  paymentId: string,
  idempotencyKey: string,
): Promise<PaymentLedgerItemDto> {
  const { data, error, response } = await api.POST(
    "/api/v1/payments/{id}/confirm-cod",
    {
      params: { path: { id: paymentId } },
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );

  if (error) {
    throw toFinanceApiError(
      error,
      response.status,
      "Không thể xác nhận thu tiền COD.",
    );
  }

  return data.data;
}

/**
 * Fetches cash-basis financial cashflow analytics (`GET /api/v1/analytics/finance`, SuperAdmin only).
 */
export async function fetchFinanceAnalytics(
  params: FinanceAnalyticsQueryParams,
): Promise<FinanceAnalyticsDto> {
  const { data, error, response } = await api.GET("/api/v1/analytics/finance", {
    params: {
      query: {
        ...(params.from ? { from: params.from } : {}),
        ...(params.to ? { to: params.to } : {}),
        granularity: params.granularity ?? "day",
      },
    },
  });

  if (error) {
    throw toFinanceApiError(
      error,
      response.status,
      "Không thể tải báo cáo dòng tiền.",
    );
  }

  return data.data;
}
