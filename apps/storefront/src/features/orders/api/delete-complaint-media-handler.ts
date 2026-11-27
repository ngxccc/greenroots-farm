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
} from "@/features/auth/utils/bff-error";
import {
  REFRESH_TOKEN_COOKIE,
  applySessionCookies,
  clearSessionCookies,
  type SessionTokenPair,
} from "@/features/auth/services/cookies";
import { isSameOriginMutationRequest } from "@/features/auth/services/csrf";
import { readServerAccessToken } from "@/features/auth/services/server-token";
import { runWithServerActionRefresh } from "@/features/auth/services/session.server";
import type { ApiProblemDetails } from "@/types/api";

const DELETE_COMPLAINT_MEDIA_BFF_INSTANCE = "/api/media/complaints";

const deleteComplaintMediaQuerySchema = z
  .object({
    url: z.url(),
    resourceType: z.enum(["image", "video"]),
  })
  .strict();

export interface DeleteComplaintMediaHandlerDeps {
  readonly allowedAppUrl?: string;
  readonly isSecure?: boolean;
  readonly readTokens?: () => Promise<{
    accessToken?: string;
    refreshToken?: string;
  }>;
  readonly deleteMedia?: (query: {
    url: string;
    resourceType: "image" | "video";
  }) => Promise<{
    response: Response;
    error?: unknown;
  }>;
  readonly runWithRefresh?: typeof runWithServerActionRefresh<undefined>;
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
    ...buildSyntheticProblem(code, DELETE_COMPLAINT_MEDIA_BFF_INSTANCE, status),
    detail,
  };
  return buildProblemJsonResponse(status, problem, extra);
}

function resolveStatusFallbackCode(status: number): ApiErrorCode {
  if (status === 401) return API_ERROR_CODES.UNAUTHORIZED;
  if (status === 403) return API_ERROR_CODES.FORBIDDEN;
  if (status === 409) return API_ERROR_CODES.CONFLICT;
  if (status >= 500) return API_ERROR_CODES.SERVICE_UNAVAILABLE;
  return API_ERROR_CODES.VALIDATION_FAILED;
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
 * Storefront BFF proxy for `DELETE /api/v1/media/complaints`.
 */
export async function handleComplaintMediaDelete(
  request: Request,
  deps?: DeleteComplaintMediaHandlerDeps,
): Promise<NextResponse> {
  const allowedAppUrl = deps?.allowedAppUrl ?? env.NEXT_PUBLIC_APP_URL;
  if (!isSameOriginMutationRequest(request, allowedAppUrl)) {
    return syntheticProblemResponse(
      403,
      API_ERROR_CODES.FORBIDDEN,
      "Cross-origin complaint media delete requests are forbidden.",
    );
  }

  const requestUrl = new URL(request.url);
  const parsed = deleteComplaintMediaQuerySchema.safeParse({
    url: requestUrl.searchParams.get("url"),
    resourceType: requestUrl.searchParams.get("resourceType"),
  });
  if (!parsed.success) {
    return syntheticProblemResponse(
      400,
      API_ERROR_CODES.VALIDATION_FAILED,
      parsed.error.issues[0]?.message ??
        "Invalid complaint media delete query.",
    );
  }

  const readTokens = deps?.readTokens ?? defaultReadTokens;
  const { accessToken, refreshToken } = await readTokens();
  if (!accessToken && !refreshToken) {
    return syntheticProblemResponse(
      401,
      API_ERROR_CODES.UNAUTHORIZED,
      "Missing authentication session.",
      { sessionInvalidated: true },
    );
  }

  const isSecure = deps?.isSecure ?? env.NODE_ENV === "production";
  const cookieState: {
    rotatedTokens: SessionTokenPair | null;
    shouldClearCookies: boolean;
  } = {
    rotatedTokens: null,
    shouldClearCookies: false,
  };

  const deleteMedia =
    deps?.deleteMedia ??
    ((query: { url: string; resourceType: "image" | "video" }) =>
      api.DELETE("/api/v1/media/complaints", {
        params: { query },
        cache: "no-store",
      }));

  const runRefresh = deps?.runWithRefresh ?? runWithServerActionRefresh;

  try {
    const result = await runRefresh(
      () => deleteMedia(parsed.data),
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

    if (result.response.ok) {
      const response = new NextResponse(null, { status: 204 });
      if (cookieState.rotatedTokens) {
        applySessionCookies(
          response.cookies,
          cookieState.rotatedTokens,
          isSecure,
        );
      }
      return response;
    }

    if (isTransientRefreshFailure(result)) {
      return syntheticProblemResponse(
        503,
        API_ERROR_CODES.SERVICE_UNAVAILABLE,
        "Complaint media delete service temporarily unavailable.",
      );
    }

    const status = result.response.status;
    const problem = extractProblemDetails(
      result.error,
      resolveStatusFallbackCode(status),
      DELETE_COMPLAINT_MEDIA_BFF_INSTANCE,
    );
    const sessionInvalidated = status === 401 || cookieState.shouldClearCookies;
    const response = buildProblemJsonResponse(status, problem, {
      sessionInvalidated,
    });
    if (sessionInvalidated) {
      clearSessionCookies(response.cookies, isSecure);
    }
    return response;
  } catch {
    return syntheticProblemResponse(
      503,
      API_ERROR_CODES.SERVICE_UNAVAILABLE,
      "Unable to reach complaint media delete service.",
    );
  }
}
