"use server";

import {
  API_ERROR_CODES,
  type ApiErrorCode,
  PaymentMethod,
} from "@greenroots/shared";
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
import {
  type CheckoutInput,
  checkoutInputSchema,
  type MockConfirmPayosInput,
  mockConfirmPayosInputSchema,
  type OrderDto,
  type ValidateCartInput,
  validateCartInputSchema,
  type ValidateCartResponse,
} from "../schemas/order.schema";
import { parseMockPayosOrderCode } from "../utils/payos-payment.utils";

const CART_INSTANCE = "/cart";
const CHECKOUT_INSTANCE = "/checkout";

/**
 * Failure payload returned by Storefront order Server Actions.
 */
export interface OrderActionFailure extends BffActionFailure {
  readonly sessionInvalidated: boolean;
}

/**
 * Discriminated result returned by `validateCartAction`.
 */
export type ValidateCartActionResult =
  | { readonly ok: true; readonly data: ValidateCartResponse }
  | OrderActionFailure;

/**
 * Discriminated result returned by `checkoutCodAction`.
 */
export type CheckoutCodActionResult =
  | { readonly ok: true; readonly order: OrderDto }
  | OrderActionFailure;

/**
 * Discriminated result returned by `getOrderAction` and `cancelOrderAction`.
 */
export type GetOrderActionResult =
  | { readonly ok: true; readonly order: OrderDto }
  | OrderActionFailure;

export type CancelOrderActionResult = GetOrderActionResult;

/**
 * Discriminated result returned by `confirmMockPayosAction`.
 */
export type ConfirmMockPayosActionResult =
  | { readonly ok: true; readonly received: boolean }
  | OrderActionFailure;

/**
 * Optional dependency overrides for isolated unit testing of order Server Actions.
 */
export interface OrderActionDeps {
  readonly postValidateCart?: (
    body: Omit<ValidateCartInput, "loyaltyPoints"> & { loyaltyPoints: number },
  ) => Promise<{
    response: Response;
    data?: { data: ValidateCartResponse };
    error?: unknown;
  }>;
  readonly postCheckout?: (
    idempotencyKey: string,
    body: Omit<
      CheckoutInput,
      "idempotencyKey" | "loyaltyPoints" | "paymentMethod"
    > & {
      loyaltyPoints: number;
      paymentMethod: typeof PaymentMethod.COD | typeof PaymentMethod.PAYOS;
    },
  ) => Promise<{
    response: Response;
    data?: { data: OrderDto };
    error?: unknown;
  }>;
  readonly getOrderById?: (orderId: string) => Promise<{
    response: Response;
    data?: { data: OrderDto };
    error?: unknown;
  }>;
  readonly cancelOrderById?: (orderId: string) => Promise<{
    response: Response;
    data?: { data: OrderDto };
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
  if (status === 409) {
    return API_ERROR_CODES.INSUFFICIENT_STOCK;
  }
  if (status === 404) {
    return API_ERROR_CODES.ADDRESS_NOT_FOUND;
  }
  if (status === 403) {
    return API_ERROR_CODES.FORBIDDEN;
  }
  if (status === 503) {
    return API_ERROR_CODES.SERVICE_UNAVAILABLE;
  }
  if (status >= 500) {
    return API_ERROR_CODES.INTERNAL_SERVER_ERROR;
  }
  return API_ERROR_CODES.VALIDATION_FAILED;
}

async function runProtectedOrderCall<TValue, TSuccess extends object>(
  instance: string,
  operation: () => Promise<{
    response: Response;
    data?: { data: TValue };
    error?: unknown;
  }>,
  mapSuccess: (data: TValue) => TSuccess,
  deps?: Pick<OrderActionDeps, "runWithRefresh" | "clearCookies">,
): Promise<({ readonly ok: true } & TSuccess) | OrderActionFailure> {
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
 * Executes `POST /api/v1/orders/validate-cart` through the Storefront BFF with
 * automatic single-flight token refresh (`ADR-0036`).
 *
 * @param input Cart items, optional address/district, and optional loyalty points.
 * @param deps Optional injectable adapters for unit testing.
 * @returns Server-authoritative cart validation breakdown or classified failure.
 */
export async function executeValidateCartAction(
  input: ValidateCartInput,
  deps?: OrderActionDeps,
): Promise<ValidateCartActionResult> {
  const parsed = validateCartInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ...buildValidationFailure(
        parsed.error,
        API_ERROR_CODES.VALIDATION_FAILED,
        CART_INSTANCE,
      ),
      sessionInvalidated: false,
    };
  }

  const postValidateCart =
    deps?.postValidateCart ??
    ((body) => api.POST("/api/v1/orders/validate-cart", { body }));

  return runProtectedOrderCall(
    CART_INSTANCE,
    () => postValidateCart(parsed.data),
    (data) => ({ data }),
    deps,
  );
}

/**
 * Executes `POST /api/v1/orders/checkout` with required UUID `Idempotency-Key`
 * header and single-flight token refresh (`ADR-0036`).
 *
 * @param input Checkout payload including `idempotencyKey`.
 * @param deps Optional injectable adapters for unit testing.
 * @returns Created `OrderDto` or classified RFC 9457 failure.
 */
export async function executeCheckoutOrderAction(
  input: CheckoutInput,
  deps?: OrderActionDeps,
): Promise<CheckoutCodActionResult> {
  const parsed = checkoutInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ...buildValidationFailure(
        parsed.error,
        API_ERROR_CODES.VALIDATION_FAILED,
        CHECKOUT_INSTANCE,
      ),
      sessionInvalidated: false,
    };
  }

  const { idempotencyKey, ...body } = parsed.data;
  const postCheckout =
    deps?.postCheckout ??
    ((key, reqBody) =>
      api.POST("/api/v1/orders/checkout", {
        params: {
          header: {
            "Idempotency-Key": key,
          },
        },
        body: reqBody,
      }));

  return runProtectedOrderCall(
    CHECKOUT_INSTANCE,
    () => postCheckout(idempotencyKey, body),
    (order) => ({ order }),
    deps,
  );
}

/**
 * Executes `POST /api/v1/orders/checkout` with `paymentMethod = COD`.
 */
export async function executeCheckoutCodAction(
  input: CheckoutInput,
  deps?: OrderActionDeps,
): Promise<CheckoutCodActionResult> {
  return executeCheckoutOrderAction(
    { ...input, paymentMethod: PaymentMethod.COD },
    deps,
  );
}

/**
 * Polls `GET /api/v1/orders/{id}` through the Storefront BFF with automatic
 * single-flight token refresh (`ADR-0036`).
 *
 * @param orderId UUIDv7 order identifier.
 * @param deps Optional injectable adapters for unit testing.
 * @returns Latest `OrderDto` or classified RFC 9457 failure.
 */
export async function executeGetOrderAction(
  orderId: string,
  deps?: OrderActionDeps,
): Promise<GetOrderActionResult> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      orderId,
    )
  ) {
    return {
      ...buildActionFailure(
        undefined,
        API_ERROR_CODES.VALIDATION_FAILED,
        `/orders/${orderId}`,
      ),
      sessionInvalidated: false,
    };
  }

  const getOrderById =
    deps?.getOrderById ??
    ((id) =>
      api.GET("/api/v1/orders/{id}", {
        params: { path: { id } },
        cache: "no-store",
      }));

  return runProtectedOrderCall(
    `/orders/${orderId}`,
    () => getOrderById(orderId),
    (order) => ({ order }),
    deps,
  );
}

/**
 * Cancels a pending customer order via `POST /api/v1/orders/{id}/cancel`
 * through the Storefront BFF with automatic single-flight token refresh (`ADR-0036`).
 *
 * @param orderId UUIDv7 order identifier.
 * @param deps Optional injectable adapters for unit testing.
 * @returns Updated cancelled `OrderDto` or classified RFC 9457 failure.
 */
export async function executeCancelOrderAction(
  orderId: string,
  deps?: OrderActionDeps,
): Promise<CancelOrderActionResult> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      orderId,
    )
  ) {
    return {
      ...buildActionFailure(
        undefined,
        API_ERROR_CODES.VALIDATION_FAILED,
        `/orders/${orderId}/cancel`,
      ),
      sessionInvalidated: false,
    };
  }

  const cancelOrderById =
    deps?.cancelOrderById ??
    ((id) =>
      api.POST("/api/v1/orders/{id}/cancel", {
        params: { path: { id } },
      }));

  return runProtectedOrderCall(
    `/orders/${orderId}/cancel`,
    () => cancelOrderById(orderId),
    (order) => ({ order }),
    deps,
  );
}

/**
 * Non-production BFF bridge that simulates a PayOS settlement webhook against
 * `POST /api/v1/payments/payos/webhook` when `MockPaymentDriver` is active.
 * Fails closed (`403 FORBIDDEN`) in `NODE_ENV === "production"`.
 *
 * @param input Order ID, mock `paymentUrl`, integer VND amount, and order code.
 * @param deps Optional injectable adapters for unit testing.
 * @returns Webhook acknowledgement or classified failure.
 */
export async function executeConfirmMockPayosAction(
  input: MockConfirmPayosInput,
  deps?: OrderActionDeps,
): Promise<ConfirmMockPayosActionResult> {
  const activeNodeEnv = deps?.nodeEnv ?? process.env.NODE_ENV;
  if (activeNodeEnv === "production") {
    return {
      ...buildActionFailure(
        undefined,
        API_ERROR_CODES.FORBIDDEN,
        CHECKOUT_INSTANCE,
      ),
      sessionInvalidated: false,
    };
  }

  const parsed = mockConfirmPayosInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ...buildValidationFailure(
        parsed.error,
        API_ERROR_CODES.VALIDATION_FAILED,
        `/orders/${input.orderId}`,
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
        `/orders/${parsed.data.orderId}`,
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
        description: parsed.data.orderCode,
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
        `/orders/${parsed.data.orderId}`,
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
 * Next.js Server Action validating storefront cart items, stock, and totals.
 */
export async function validateCartAction(
  input: ValidateCartInput,
): Promise<ValidateCartActionResult> {
  return executeValidateCartAction(input);
}

/**
 * Next.js Server Action placing a COD or PayOS order with `Idempotency-Key` protection.
 */
export async function checkoutOrderAction(
  input: CheckoutInput,
): Promise<CheckoutCodActionResult> {
  return executeCheckoutOrderAction(input);
}

/**
 * Next.js Server Action placing a COD order with `Idempotency-Key` protection.
 */
export async function checkoutCodAction(
  input: CheckoutInput,
): Promise<CheckoutCodActionResult> {
  return executeCheckoutCodAction(input);
}

/**
 * Next.js Server Action polling the latest order snapshot for `/orders/[id]`.
 */
export async function getOrderAction(
  orderId: string,
): Promise<GetOrderActionResult> {
  return executeGetOrderAction(orderId);
}

/**
 * Next.js Server Action cancelling a pending customer order.
 */
export async function cancelOrderAction(
  orderId: string,
): Promise<CancelOrderActionResult> {
  return executeCancelOrderAction(orderId);
}

/**
 * Next.js Server Action triggering mock PayOS webhook settlement in non-production environments.
 */
export async function confirmMockPayosAction(
  input: MockConfirmPayosInput,
): Promise<ConfirmMockPayosActionResult> {
  return executeConfirmMockPayosAction(input);
}
