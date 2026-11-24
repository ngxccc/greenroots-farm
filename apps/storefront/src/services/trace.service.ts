import { resolveSharedApiErrorMessage } from "@greenroots/shared";
import { api } from "@/lib/api-client";
import type {
  RecentTraceBatchItem,
  TraceLookupResult,
  TraceRecord,
} from "@/types/trace.types";

const DEFAULT_RECENT_TRACE_LIMIT = 4;

/** Injectable API fetchers for deterministic unit testing of trace service functions. */
export interface TraceServiceDeps {
  readonly fetchRecent: (query: { limit?: number }) => Promise<{
    readonly data?: { readonly data?: readonly RecentTraceBatchItem[] };
    readonly error?: unknown;
    readonly response?: { readonly status: number };
  }>;
  readonly fetchByBatchCode: (batchCode: string) => Promise<{
    readonly data?: { readonly data?: TraceRecord };
    readonly error?: unknown;
    readonly response?: { readonly status: number };
  }>;
}

const defaultTraceServiceDeps: TraceServiceDeps = {
  fetchRecent: (query) => api.GET("/api/v1/trace", { params: { query } }),
  fetchByBatchCode: (batchCode) =>
    api.GET("/api/v1/trace/{batchCode}", {
      params: { path: { batchCode } },
    }),
};

function extractProblemError(error: unknown): {
  status?: number;
  code?: string;
  detail?: string;
} {
  if (typeof error !== "object" || error === null) {
    return {};
  }
  const record = error as Record<string, unknown>;
  return {
    status: typeof record.status === "number" ? record.status : undefined,
    code: typeof record.code === "string" ? record.code : undefined,
    detail: typeof record.detail === "string" ? record.detail : undefined,
  };
}

/**
 * Fetches the most recently harvested active batches from `GET /api/v1/trace`.
 * Degrades gracefully to `[]` if the API is unreachable so `/trace` remains usable.
 *
 * @param limit Maximum number of recent batches to request (default `4`).
 * @param deps Optional injectable API fetchers for unit tests.
 * @returns Ordered list of redacted recent batch summaries.
 */
export async function fetchRecentTraceBatches(
  limit = DEFAULT_RECENT_TRACE_LIMIT,
  deps: Pick<TraceServiceDeps, "fetchRecent"> = defaultTraceServiceDeps,
): Promise<readonly RecentTraceBatchItem[]> {
  try {
    const result = await deps.fetchRecent({ limit });
    if (result.error || !result.data?.data) {
      return [];
    }
    return result.data.data;
  } catch {
    return [];
  }
}

/**
 * Fetches the full public QR traceability record for a batch code from `GET /api/v1/trace/:batchCode`.
 *
 * @param rawBatchCode Candidate batch code from route params or lookup form.
 * @param deps Optional injectable API fetchers for unit tests.
 * @returns Discriminated lookup result distinguishing `not_found` (`400`/`404`) from transient errors.
 */
export async function fetchTraceByBatchCode(
  rawBatchCode: string,
  deps: Pick<TraceServiceDeps, "fetchByBatchCode"> = defaultTraceServiceDeps,
): Promise<TraceLookupResult> {
  const normalized = rawBatchCode.trim().toUpperCase();
  if (!normalized) {
    return {
      ok: false,
      reason: "not_found",
      message: "Vui lòng nhập mã lô để tra cứu.",
    };
  }

  try {
    const result = await deps.fetchByBatchCode(normalized);
    if (result.data?.data) {
      return { ok: true, data: result.data.data };
    }

    const problem = extractProblemError(result.error);
    const status = result.response?.status ?? problem.status;
    if (status === 404 || status === 400) {
      return {
        ok: false,
        reason: "not_found",
        message: resolveSharedApiErrorMessage(
          problem.code,
          "Không tìm thấy mã lô nông sản.",
        ),
      };
    }

    return {
      ok: false,
      reason: "error",
      message: resolveSharedApiErrorMessage(
        problem.code,
        "Không thể tải dữ liệu truy xuất lúc này. Vui lòng thử lại sau.",
      ),
    };
  } catch {
    return {
      ok: false,
      reason: "error",
      message: "Không thể kết nối máy chủ truy xuất nguồn gốc.",
    };
  }
}
