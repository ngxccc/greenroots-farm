import { API_ERROR_CODES, type ApiErrorCode } from "@greenroots/shared";
import { z } from "zod";
import { api } from "@/lib/api-client";
import {
  type BffActionFailure,
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
import { parseMockPayosOrderCode } from "@/features/orders/utils/payos-payment.utils";
import {
  type CreateSubscriptionCheckoutDto,
  type CreateSubscriptionCheckoutInput,
  type MockConfirmSubscriptionPayosInput,
  type SubscriptionDto,
  createSubscriptionCheckoutInputSchema,
  mockConfirmSubscriptionPayosInputSchema,
} from "../schemas/subscription.schema";

const SUBSCRIPTIONS_INSTANCE = "/subscriptions";

/**
 * Failure payload returned by Storefront subscription Server Actions.
 */
export interface SubscriptionActionFailure extends BffActionFailure {
  readonly sessionInvalidated: boolean;
}

/**
 * Discriminated result returned by `createSubscriptionCheckoutAction`.
 */
export type CreateSubscriptionCheckoutActionResult =
  | { readonly ok: true; readonly subscription: SubscriptionDto }
  | SubscriptionActionFailure;

/**
 * Discriminated result returned by `getSubscriptionAction` and `cancelSubscriptionAction`.
 */
export type GetSubscriptionActionResult =
  | { readonly ok: true; readonly subscription: SubscriptionDto }
  | SubscriptionActionFailure;

/**
 * Discriminated result returned by `cancelSubscriptionAction`.
 */
export type CancelSubscriptionActionResult = GetSubscriptionActionResult;

/**
 * Discriminated result returned by `confirmMockSubscriptionPayosAction`.
 */
export type ConfirmMockSubscriptionPayosActionResult =
  | { readonly ok: true; readonly received: boolean }
  | SubscriptionActionFailure;

/**
 * Optional dependency overrides for isolated unit testing of subscription Server Actions.
 */
export interface SubscriptionActionDeps {
  readonly postSubscriptionCheckout?: (
    idempotencyKey: string,
    body: CreateSubscriptionCheckoutDto,
  ) => Promise<{
    response: Response;
    data?: { data: SubscriptionDto };
    error?: unknown;
  }>;
  readonly getSubscriptionById?: (subscriptionId: string) => Promise<{
    response: Response;
    data?: { data: SubscriptionDto };
    error?: unknown;
  }>;
  readonly cancelSubscriptionById?: (subscriptionId: string) => Promise<{
    response: Response;
    data?: { data: SubscriptionDto };
    error?: unknown;
  }>;
  readonly postMockWebhook?: (payload: {
    code: string;
    desc: string;
    success: boolean;
    data: Record<string, unknown>;
    signature: string;
  }) => Promise<{
    response: Response;
    data?: { data: { received: boolean } };
    error?: unknown;
  }>;
  readonly nodeEnv?: string;
  readonly runWithRefresh?: typeof runWithServerActionRefresh;
  readonly clearCookies?: () => Promise<void>;
}

function resolveStatusFallbackCode(status: number): ApiErrorCode {
  if (status === 429) {
    return API_ERROR_CODES.TOO_MANY_REQUESTS;
  }
  if (status === 404) {
    return API_ERROR_CODES.SUBSCRIPTION_NOT_FOUND;
  }
  if (status === 403) {
    return API_ERROR_CODES.FORBIDDEN;
  }
  if (status === 502) {
    return API_ERROR_CODES.PAYMENT_GATEWAY_ERROR;
  }
  if (status === 503) {
    return API_ERROR_CODES.SERVICE_UNAVAILABLE;
  }
  if (status >= 500) {
    return API_ERROR_CODES.INTERNAL_SERVER_ERROR;
  }
  return API_ERROR_CODES.VALIDATION_FAILED;
}

async function runProtectedSubscriptionCall<TValue, TSuccess extends object>(
  instance: string,
  operation: () => Promise<{
    response: Response;
    data?: { data: TValue };
    error?: unknown;
  }>,
  mapSuccess: (data: TValue) => TSuccess,
  deps?: Pick<SubscriptionActionDeps, "runWithRefresh" | "clearCookies">,
): Promise<({ readonly ok: true } & TSuccess) | SubscriptionActionFailure> {
  const runWithRefresh = deps?.runWithRefresh ?? runWithServerActionRefresh;
  const clearCookies = deps?.clearCookies ?? clearServerSessionCookies;

  try {
    const result = await runWithRefresh(operation);

    if (!result.error && result.response.ok) {
      const data = result.data?.data;
      if (!data) {
        return {
          ...buildActionFailure(
            undefined,
            API_ERROR_CODES.INTERNAL_SERVER_ERROR,
            instance,
          ),
          sessionInvalidated: false,
        };
      }
      return { ok: true, ...mapSuccess(data) };
    }

    if (isTransientRefreshFailure(result)) {
      return {
        ...buildServiceUnavailableFailure(instance),
        sessionInvalidated: false,
      };
    }

    if (result.response.status === 401) {
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
        resolveStatusFallbackCode(result.response.status),
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

/**
 * Executes `POST /api/v1/subscriptions` with required UUID `Idempotency-Key`
 * header and single-flight token refresh (`ADR-0036`).
 *
 * @param input Checkout payload including `idempotencyKey`, `planId`, optional `addressId`, and `deliveryDay`.
 * @param deps Optional injectable adapters for unit testing.
 * @returns Created `SubscriptionDto` or classified RFC 9457 failure.
 */
export async function executeCreateSubscriptionCheckoutAction(
  input: CreateSubscriptionCheckoutInput,
  deps?: SubscriptionActionDeps,
): Promise<CreateSubscriptionCheckoutActionResult> {
  const parsed = createSubscriptionCheckoutInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ...buildValidationFailure(
        parsed.error,
        API_ERROR_CODES.VALIDATION_FAILED,
        SUBSCRIPTIONS_INSTANCE,
      ),
      sessionInvalidated: false,
    };
  }

  const { idempotencyKey, ...body } = parsed.data;
  const postSubscriptionCheckout =
    deps?.postSubscriptionCheckout ??
    ((key, reqBody) =>
      api.POST("/api/v1/subscriptions", {
        params: {
          header: {
            "Idempotency-Key": key,
          },
        },
        body: reqBody,
      }));

  return runProtectedSubscriptionCall(
    SUBSCRIPTIONS_INSTANCE,
    () => postSubscriptionCheckout(idempotencyKey, body),
    (subscription) => ({ subscription }),
    deps,
  );
}

/**
 * Fetches the latest customer subscription snapshot via `GET /api/v1/subscriptions/{id}`
 * with automatic single-flight token refresh (`ADR-0036`).
 *
 * @param subscriptionId UUIDv7 subscription identifier.
 * @param deps Optional injectable adapters for unit testing.
 * @returns Current `SubscriptionDto` or classified RFC 9457 failure.
 */
export async function executeGetSubscriptionAction(
  subscriptionId: string,
  deps?: SubscriptionActionDeps,
): Promise<GetSubscriptionActionResult> {
  if (!z.uuid().safeParse(subscriptionId).success) {
    return {
      ...buildActionFailure(
        undefined,
        API_ERROR_CODES.VALIDATION_FAILED,
        `/subscriptions/${subscriptionId}`,
      ),
      sessionInvalidated: false,
    };
  }

  const getSubscriptionById =
    deps?.getSubscriptionById ??
    ((id) =>
      api.GET("/api/v1/subscriptions/{id}", {
        params: { path: { id } },
        cache: "no-store",
      }));

  return runProtectedSubscriptionCall(
    `/subscriptions/${subscriptionId}`,
    () => getSubscriptionById(subscriptionId),
    (subscription) => ({ subscription }),
    deps,
  );
}

/**
 * Cancels a `pending_payment` subscription via `POST /api/v1/subscriptions/{id}/cancel`
 * with automatic single-flight token refresh (`ADR-0036`).
 *
 * @param subscriptionId UUIDv7 subscription identifier.
 * @param deps Optional injectable adapters for unit testing.
 * @returns Updated cancelled `SubscriptionDto` or classified RFC 9457 failure.
 */
export async function executeCancelSubscriptionAction(
  subscriptionId: string,
  deps?: SubscriptionActionDeps,
): Promise<CancelSubscriptionActionResult> {
  if (!z.uuid().safeParse(subscriptionId).success) {
    return {
      ...buildActionFailure(
        undefined,
        API_ERROR_CODES.VALIDATION_FAILED,
        `/subscriptions/${subscriptionId}/cancel`,
      ),
      sessionInvalidated: false,
    };
  }

  const cancelSubscriptionById =
    deps?.cancelSubscriptionById ??
    ((id) =>
      api.POST("/api/v1/subscriptions/{id}/cancel", {
        params: { path: { id } },
      }));

  return runProtectedSubscriptionCall(
    `/subscriptions/${subscriptionId}/cancel`,
    () => cancelSubscriptionById(subscriptionId),
    (subscription) => ({ subscription }),
    deps,
  );
}

/**
 * Non-production BFF bridge that simulates a PayOS settlement webhook against
 * `POST /api/v1/payments/payos/webhook` when `MockPaymentDriver` is active.
 * Fails closed (`403 FORBIDDEN`) in `NODE_ENV === "production"`.
 *
 * @param input Subscription ID, mock `paymentUrl`, integer VND amount, and subscription code.
 * @param deps Optional injectable adapters for unit testing.
 * @returns Webhook acknowledgement or classified failure.
 */
export async function executeConfirmMockSubscriptionPayosAction(
  input: MockConfirmSubscriptionPayosInput,
  deps?: SubscriptionActionDeps,
): Promise<ConfirmMockSubscriptionPayosActionResult> {
  const activeNodeEnv = deps?.nodeEnv ?? process.env.NODE_ENV;
  if (activeNodeEnv === "production") {
    return {
      ...buildActionFailure(
        undefined,
        API_ERROR_CODES.FORBIDDEN,
        `/subscriptions/${input.subscriptionId}`,
      ),
      sessionInvalidated: false,
    };
  }

  const parsed = mockConfirmSubscriptionPayosInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ...buildValidationFailure(
        parsed.error,
        API_ERROR_CODES.VALIDATION_FAILED,
        `/subscriptions/${input.subscriptionId}`,
      ),
      sessionInvalidated: false,
    };
  }

  const payosOrderCode = parseMockPayosOrderCode(parsed.data.paymentUrl);
  if (payosOrderCode === null) {
    return {
      ...buildActionFailure(
        undefined,
        API_ERROR_CODES.VALIDATION_FAILED,
        `/subscriptions/${parsed.data.subscriptionId}`,
      ),
      sessionInvalidated: false,
    };
  }

  const postMockWebhook =
    deps?.postMockWebhook ??
    ((payload) =>
      api.POST("/api/v1/payments/payos/webhook", {
        body: payload,
      }));

  try {
    const result = await postMockWebhook({
      code: "00",
      desc: "success",
      success: true,
      data: {
        orderCode: payosOrderCode,
        amount: parsed.data.amountVnd,
        description: parsed.data.subscriptionCode,
        accountNumber: "MOCK-VA",
        reference: `MOCK-${payosOrderCode}`,
        transactionDateTime: new Date().toISOString(),
        currency: "VND",
        paymentLinkId: `mock-link-${payosOrderCode}`,
        code: "00",
        desc: "success",
      },
      signature: "mock-storefront-bridge",
    });

    if (!result.error && result.response.ok && result.data?.data) {
      return { ok: true, received: result.data.data.received };
    }

    return {
      ...buildActionFailure(
        result.error,
        resolveStatusFallbackCode(result.response.status),
        `/subscriptions/${parsed.data.subscriptionId}`,
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
