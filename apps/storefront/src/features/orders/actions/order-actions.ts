"use server";

import { API_ERROR_CODES, type ApiErrorCode } from "@greenroots/shared";
import { api } from "@/lib/api-client";
import {
  type BffActionFailure,
  buildActionFailure,
  buildNetworkFailure,
  buildServiceUnavailableFailure,
  buildValidationFailure,
  isTransientRefreshFailure,
} from "@/lib/auth/bff-error";
import {
  clearServerSessionCookies,
  runWithServerActionRefresh,
} from "@/lib/auth/session.server";
import {
  type CheckoutInput,
  checkoutInputSchema,
  type OrderDto,
  type ValidateCartInput,
  validateCartInputSchema,
  type ValidateCartResponse,
} from "../schemas/order.schema";

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
    body: Omit<CheckoutInput, "idempotencyKey" | "loyaltyPoints"> & {
      loyaltyPoints: number;
    },
  ) => Promise<{
    response: Response;
    data?: { data: OrderDto };
    error?: unknown;
  }>;
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
export async function executeCheckoutCodAction(
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
 * Next.js Server Action validating storefront cart items, stock, and totals.
 */
export async function validateCartAction(
  input: ValidateCartInput,
): Promise<ValidateCartActionResult> {
  return executeValidateCartAction(input);
}

/**
 * Next.js Server Action placing a COD order with `Idempotency-Key` protection.
 */
export async function checkoutCodAction(
  input: CheckoutInput,
): Promise<CheckoutCodActionResult> {
  return executeCheckoutCodAction(input);
}
