import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, type ApiErrorCode } from "@greenroots/shared";
import { z } from "zod";
import { resolveApiErrorMessage } from "@/constants/error-dictionary.constant";
import { env } from "@/env";
import { api } from "@/lib/api-client";
import {
  buildSyntheticProblem,
  extractProblemDetails,
  isTransientRefreshFailure,
} from "@/lib/auth/bff-error";
import {
  REFRESH_TOKEN_COOKIE,
  applySessionCookies,
  clearSessionCookies,
  type SessionTokenPair,
} from "@/lib/auth/cookies";
import { isSameOriginMutationRequest } from "@/lib/auth/csrf";
import { readServerAccessToken } from "@/lib/auth/server-token";
import {
  runWithServerActionRefresh,
  type ServerActionRefreshOutcome,
} from "@/lib/auth/session.server";
import type { ShippingQuote, ShippingQuoteRequest } from "@/lib/shipping";
import type { ApiProblemDetails } from "@/types/api";

const SHIPPING_QUOTE_BFF_INSTANCE = "/api/shipping/quote";

const shippingQuoteRequestSchema = z
  .object({
    addressId: z.uuid({ version: "v7" }).optional(),
    districtCode: z.string().trim().min(1).max(50).optional(),
    isSubscription: z.boolean().optional().default(false),
  })
  .strict()
  .refine(
    (data) => Boolean(data.addressId) !== Boolean(data.districtCode),
    "Provide exactly one of addressId or districtCode.",
  );

/**
 * Optional dependency overrides for isolated unit testing of `handleShippingQuotePost`.
 */
export interface ShippingQuoteHandlerDeps {
  readonly allowedAppUrl?: string;
  readonly isSecure?: boolean;
  readonly readTokens?: () => Promise<{
    accessToken?: string;
    refreshToken?: string;
  }>;
  readonly postQuote?: (body: ShippingQuoteRequest) => Promise<{
    response: Response;
    data?: { data: ShippingQuote };
    error?: unknown;
  }>;
  readonly runWithRefresh?: typeof runWithServerActionRefresh<{
    data: ShippingQuote;
  }>;
}

function buildProblemJsonResponse(
  status: number,
  problem: ApiProblemDetails,
  extra?: { readonly sessionInvalidated?: boolean },
): NextResponse {
  return NextResponse.json(
    {
      ...problem,
      status,
      message: resolveApiErrorMessage(problem),
      ...(extra?.sessionInvalidated ? { sessionInvalidated: true } : {}),
    },
    {
      status,
      headers: { "Content-Type": "application/problem+json" },
    },
  );
}

function syntheticProblemResponse(
  status: number,
  code: ApiErrorCode,
  detail: string,
  extra?: { readonly sessionInvalidated?: boolean },
): NextResponse {
  const problem: ApiProblemDetails = {
    ...buildSyntheticProblem(code, SHIPPING_QUOTE_BFF_INSTANCE, status),
    detail,
  };
  return buildProblemJsonResponse(status, problem, extra);
}

function resolveStatusFallbackCode(status: number): ApiErrorCode {
  if (status === 401) {
    return API_ERROR_CODES.UNAUTHORIZED;
  }
  if (status === 403) {
    return API_ERROR_CODES.FORBIDDEN;
  }
  if (status === 404) {
    return API_ERROR_CODES.FARM_NOT_FOUND;
  }
  if (status === 422) {
    return API_ERROR_CODES.DISTRICT_CODE_INVALID;
  }
  if (status === 429) {
    return API_ERROR_CODES.TOO_MANY_REQUESTS;
  }
  if (status >= 500) {
    return API_ERROR_CODES.SERVICE_UNAVAILABLE;
  }
  return API_ERROR_CODES.VALIDATION_FAILED;
}

function isConfirmedInvalidRefresh(
  outcome: ServerActionRefreshOutcome | undefined,
): boolean {
  return outcome === "invalid" || outcome === "missing_refresh_token";
}

async function defaultReadTokens(): Promise<{
  accessToken?: string;
  refreshToken?: string;
}> {
  const [accessToken, cookieStore] = await Promise.all([
    readServerAccessToken(),
    cookies(),
  ]);
  return {
    accessToken,
    refreshToken: cookieStore.get(REFRESH_TOKEN_COOKIE)?.value,
  };
}

/**
 * Handles `POST /api/shipping/quote` from the Storefront browser client.
 * Enforces same-origin CSRF checks, validates strict XOR `addressId | districtCode` input,
 * and bridges `httpOnly` access tokens with single-flight refresh to `POST /api/v1/shipping/quote`.
 *
 * @param request Incoming HTTP request.
 * @param deps Optional dependency overrides for unit testing.
 * @returns `200` JSON quote envelope or RFC 9457 problem response.
 */
export async function handleShippingQuotePost(
  request: Request,
  deps?: ShippingQuoteHandlerDeps,
): Promise<NextResponse> {
  const allowedAppUrl = deps?.allowedAppUrl ?? env.NEXT_PUBLIC_APP_URL;
  if (!isSameOriginMutationRequest(request, allowedAppUrl)) {
    return syntheticProblemResponse(
      403,
      API_ERROR_CODES.FORBIDDEN,
      "Cross-origin shipping quote requests are not permitted.",
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return syntheticProblemResponse(
      400,
      API_ERROR_CODES.VALIDATION_FAILED,
      "Invalid JSON request body.",
    );
  }

  const parsed = shippingQuoteRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return syntheticProblemResponse(
      400,
      API_ERROR_CODES.VALIDATION_FAILED,
      parsed.error.issues.at(0)?.message ?? "Invalid shipping quote payload.",
    );
  }

  // Only fail fast when BOTH access token and refresh token are absent;
  // an expired access cookie with a valid refresh cookie must proceed to single-flight refresh (ADR-0036).
  const readTokens = deps?.readTokens ?? defaultReadTokens;
  const { accessToken, refreshToken } = await readTokens();
  if (!accessToken && !refreshToken) {
    return syntheticProblemResponse(
      401,
      API_ERROR_CODES.UNAUTHORIZED,
      "Authentication required for shipping quote.",
      { sessionInvalidated: true },
    );
  }

  const quoteBody: ShippingQuoteRequest = parsed.data.addressId
    ? {
        addressId: parsed.data.addressId,
        isSubscription: parsed.data.isSubscription,
      }
    : {
        districtCode: parsed.data.districtCode,
        isSubscription: parsed.data.isSubscription,
      };

  const cookieState: {
    rotatedTokens: SessionTokenPair | null;
    shouldClearCookies: boolean;
  } = {
    rotatedTokens: null,
    shouldClearCookies: false,
  };

  const postQuote =
    deps?.postQuote ??
    ((body: ShippingQuoteRequest) =>
      api.POST("/api/v1/shipping/quote", {
        body,
        cache: "no-store",
      }));

  const runRefresh = deps?.runWithRefresh ?? runWithServerActionRefresh;

  try {
    const result = await runRefresh(
      () => postQuote(quoteBody),
      deps?.runWithRefresh
        ? undefined
        : {
            applyTokens: (tokens) => {
              cookieState.rotatedTokens = tokens;
              return Promise.resolve();
            },
            clearTokens: () => {
              cookieState.shouldClearCookies = true;
              return Promise.resolve();
            },
          },
    );

    if (result.response.ok && result.data) {
      const response = NextResponse.json(
        { success: true, data: result.data.data },
        { status: 200 },
      );
      if (cookieState.rotatedTokens) {
        applySessionCookies(
          response.cookies,
          cookieState.rotatedTokens,
          deps?.isSecure,
        );
      }
      return response;
    }

    if (isTransientRefreshFailure(result)) {
      return syntheticProblemResponse(
        503,
        API_ERROR_CODES.SERVICE_UNAVAILABLE,
        "Không thể làm mới phiên đăng nhập lúc này. Vui lòng thử lại.",
      );
    }

    const status = result.response.ok ? 502 : result.response.status || 500;
    const fallbackCode = resolveStatusFallbackCode(status);
    const problem = extractProblemDetails(
      result.error,
      fallbackCode,
      SHIPPING_QUOTE_BFF_INSTANCE,
    );
    const sessionInvalidated =
      status === 401 && isConfirmedInvalidRefresh(result.refreshOutcome);

    const errorResponse = buildProblemJsonResponse(status, problem, {
      sessionInvalidated,
    });

    if (cookieState.shouldClearCookies || sessionInvalidated) {
      clearSessionCookies(errorResponse.cookies, deps?.isSecure);
    } else if (cookieState.rotatedTokens) {
      applySessionCookies(
        errorResponse.cookies,
        cookieState.rotatedTokens,
        deps?.isSecure,
      );
    }

    return errorResponse;
  } catch {
    return syntheticProblemResponse(
      503,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      "Không thể kết nối tới máy chủ GreenRoots Farm.",
    );
  }
}
