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
import type { SignedUploadResponse } from "../schemas/complaint.schema";
import type { ApiProblemDetails } from "@/types/api";

const UPLOAD_SIGNATURE_BFF_INSTANCE = "/api/media/upload-signature";

const uploadSignatureRequestSchema = z
  .object({
    resourceType: z.enum(["image", "video"]),
    fileSizeBytes: z.number().int().positive(),
  })
  .strict();

export interface UploadSignatureHandlerDeps {
  readonly allowedAppUrl?: string;
  readonly isSecure?: boolean;
  readonly readTokens?: () => Promise<{
    accessToken?: string;
    refreshToken?: string;
  }>;
  readonly postSignature?: (body: {
    folder: "complaints";
    resourceType: "image" | "video";
    fileSizeBytes: number;
  }) => Promise<{
    response: Response;
    data?: { data: SignedUploadResponse };
    error?: unknown;
  }>;
  readonly runWithRefresh?: typeof runWithServerActionRefresh<{
    data: SignedUploadResponse;
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
    ...buildSyntheticProblem(code, UPLOAD_SIGNATURE_BFF_INSTANCE, status),
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
  if (status === 422) {
    return API_ERROR_CODES.UNPROCESSABLE_ENTITY;
  }
  if (status === 429) {
    return API_ERROR_CODES.TOO_MANY_REQUESTS;
  }
  if (status >= 500) {
    return API_ERROR_CODES.SERVICE_UNAVAILABLE;
  }
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
 * Storefront BFF proxy for `POST /api/v1/media/upload-signature` (`complaints` folder only).
 */
export async function handleUploadSignaturePost(
  request: Request,
  deps?: UploadSignatureHandlerDeps,
): Promise<NextResponse> {
  const allowedAppUrl = deps?.allowedAppUrl ?? env.NEXT_PUBLIC_APP_URL;
  if (!isSameOriginMutationRequest(request, allowedAppUrl)) {
    return syntheticProblemResponse(
      403,
      API_ERROR_CODES.FORBIDDEN,
      "Cross-origin upload signature requests are forbidden.",
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return syntheticProblemResponse(
      400,
      API_ERROR_CODES.VALIDATION_FAILED,
      "Request body must be valid JSON.",
    );
  }

  const parsed = uploadSignatureRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return syntheticProblemResponse(
      400,
      API_ERROR_CODES.VALIDATION_FAILED,
      parsed.error.issues[0]?.message ?? "Invalid upload signature payload.",
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

  const postSignature =
    deps?.postSignature ??
    ((body: {
      folder: "complaints";
      resourceType: "image" | "video";
      fileSizeBytes: number;
    }) =>
      api.POST("/api/v1/media/upload-signature", {
        body,
        cache: "no-store",
      }));

  const runRefresh = deps?.runWithRefresh ?? runWithServerActionRefresh;

  try {
    const result = await runRefresh(
      () =>
        postSignature({
          folder: "complaints",
          resourceType: parsed.data.resourceType,
          fileSizeBytes: parsed.data.fileSizeBytes,
        }),
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

    if (result.response.ok && result.data?.data) {
      const response = NextResponse.json(
        { success: true, data: result.data.data },
        { status: 200 },
      );
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
        "Upload signature service temporarily unavailable.",
      );
    }

    const status = result.response.status;
    const problem = extractProblemDetails(
      result.error,
      resolveStatusFallbackCode(status),
      UPLOAD_SIGNATURE_BFF_INSTANCE,
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
      "Unable to reach upload signature service.",
    );
  }
}
