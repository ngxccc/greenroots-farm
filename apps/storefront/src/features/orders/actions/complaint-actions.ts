"use server";

import { API_ERROR_CODES, type ApiErrorCode } from "@greenroots/shared";
import { api } from "@/lib/api-client";
import {
  buildActionFailure,
  buildNetworkFailure,
  buildServiceUnavailableFailure,
  buildValidationFailure,
  isTransientRefreshFailure,
} from "@/features/auth/utils/bff-error";
import {
  clearServerSessionCookies,
  runWithServerActionRefresh,
} from "@/features/auth/services/session.server";
import {
  type ComplaintDto,
  type CreateComplaintRequest,
  type SubmitComplaintInput,
  submitComplaintInputSchema,
} from "../schemas/complaint.schema";
import type { OrderActionFailure } from "./order-actions";

export type SubmitComplaintActionResult =
  | { readonly ok: true; readonly complaint: ComplaintDto }
  | OrderActionFailure;

export interface ComplaintActionDeps {
  readonly postComplaint?: (
    orderId: string,
    body: CreateComplaintRequest,
  ) => Promise<{
    response: Response;
    data?: { data: ComplaintDto };
    error?: unknown;
  }>;
  readonly runWithRefresh?: typeof runWithServerActionRefresh;
  readonly clearCookies?: () => Promise<void>;
}

function resolveComplaintErrorFallback(status: number): ApiErrorCode {
  if (status === 401) return API_ERROR_CODES.UNAUTHORIZED;
  if (status === 403) return API_ERROR_CODES.FORBIDDEN;
  if (status === 404) return API_ERROR_CODES.ORDER_NOT_FOUND;
  if (status === 409) return API_ERROR_CODES.ORDER_COMPLAINT_ALREADY_EXISTS;
  if (status === 422) return API_ERROR_CODES.ORDER_COMPLAINT_WINDOW_EXPIRED;
  if (status === 429) return API_ERROR_CODES.TOO_MANY_REQUESTS;
  if (status >= 500) return API_ERROR_CODES.SERVICE_UNAVAILABLE;
  return API_ERROR_CODES.VALIDATION_FAILED;
}

/**
 * Submits a customer post-delivery complaint (`POST /api/v1/orders/:id/complaints`)
 * through the authenticated Storefront BFF (`ADR-0036`, `ADR-0040`).
 */
export async function submitComplaintAction(
  input: SubmitComplaintInput,
  deps?: ComplaintActionDeps,
): Promise<SubmitComplaintActionResult> {
  const instance = `/orders/${typeof input.orderId === "string" ? input.orderId : ""}/complaint`;
  const parsed = submitComplaintInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ...buildValidationFailure(
        parsed.error,
        API_ERROR_CODES.VALIDATION_FAILED,
        instance,
      ),
      sessionInvalidated: false,
    };
  }

  const runWithRefresh = deps?.runWithRefresh ?? runWithServerActionRefresh;
  const clearCookies = deps?.clearCookies ?? clearServerSessionCookies;
  const postComplaint =
    deps?.postComplaint ??
    ((orderId: string, body: CreateComplaintRequest) =>
      api.POST("/api/v1/orders/{id}/complaints", {
        params: { path: { id: orderId } },
        body,
        cache: "no-store",
      }));

  try {
    const result = await runWithRefresh(() =>
      postComplaint(parsed.data.orderId, {
        category: parsed.data.category,
        affectedOrderItemIds: parsed.data.affectedOrderItemIds,
        reason: parsed.data.reason,
        proofImageUrls: parsed.data.proofImageUrls,
        proofVideoUrl: parsed.data.proofVideoUrl ?? null,
      }),
    );

    if (!result.error && result.response.ok) {
      const complaint = result.data?.data;
      if (!complaint) {
        return {
          ...buildActionFailure(
            undefined,
            API_ERROR_CODES.INTERNAL_SERVER_ERROR,
            instance,
          ),
          sessionInvalidated: false,
        };
      }
      return { ok: true, complaint };
    }

    if (isTransientRefreshFailure(result)) {
      return {
        ...buildServiceUnavailableFailure(instance),
        sessionInvalidated: false,
      };
    }

    const status = result.response.status;
    if (status === 401) {
      await clearCookies();
      return {
        ...buildActionFailure(
          result.error,
          API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
          instance,
        ),
        sessionInvalidated: true,
      };
    }

    return {
      ...buildActionFailure(
        result.error,
        resolveComplaintErrorFallback(status),
        instance,
      ),
      sessionInvalidated: false,
    };
  } catch {
    return {
      ...buildNetworkFailure(),
      sessionInvalidated: false,
    };
  }
}
