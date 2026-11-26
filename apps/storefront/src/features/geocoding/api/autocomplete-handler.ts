import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_ERROR_CODES, type ApiErrorCode } from "@greenroots/shared";
import { z } from "zod";
import { resolveApiErrorMessage } from "@/constants/error-dictionary.constant";
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
import { readServerAccessToken } from "@/features/auth/services/server-token";
import {
  runWithServerActionRefresh,
  type ServerActionRefreshOutcome,
} from "@/features/auth/services/session.server";
import type { PlaceSuggestion } from "@/features/geocoding/types/geocoding.types";
import type { ApiProblemDetails } from "@/types/api";

const GEOCODING_BFF_INSTANCE = "/api/geocoding/autocomplete";

const autocompleteQuerySchema = z.object({
  q: z.string().trim().min(3).max(200),
});

/**
 * Optional dependency overrides for isolated unit testing of `handleGeocodingAutocompleteGet`.
 */
export interface GeocodingAutocompleteHandlerDeps {
  readonly isSecure?: boolean;
  readonly readTokens?: () => Promise<{
    accessToken?: string;
    refreshToken?: string;
  }>;
  readonly fetchAutocomplete?: (q: string) => Promise<{
    response: Response;
    data?: { data: PlaceSuggestion[] };
    error?: unknown;
  }>;
  readonly runWithRefresh?: typeof runWithServerActionRefresh<{
    data: PlaceSuggestion[];
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
    ...buildSyntheticProblem(code, GEOCODING_BFF_INSTANCE, status),
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
  if (status === 429) {
    return API_ERROR_CODES.TOO_MANY_REQUESTS;
  }
  if (status === 503) {
    return API_ERROR_CODES.GEOCODING_UNAVAILABLE;
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
 * Handles `GET /api/geocoding/autocomplete?q=...` from the Storefront browser client,
 * requiring an active customer session and forwarding to `GET /api/v1/geocoding/autocomplete`.
 */
export async function handleGeocodingAutocompleteGet(
  request: Request,
  deps?: GeocodingAutocompleteHandlerDeps,
): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsed = autocompleteQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
  });

  if (!parsed.success) {
    return syntheticProblemResponse(
      400,
      API_ERROR_CODES.VALIDATION_FAILED,
      "Query parameter q must be between 3 and 200 characters.",
    );
  }

  const readTokens = deps?.readTokens ?? defaultReadTokens;
  const { accessToken, refreshToken } = await readTokens();
  if (!accessToken && !refreshToken) {
    return syntheticProblemResponse(
      401,
      API_ERROR_CODES.UNAUTHORIZED,
      "Authentication required for address autocomplete.",
      { sessionInvalidated: true },
    );
  }

  const cookieState: {
    rotatedTokens: SessionTokenPair | null;
    shouldClearCookies: boolean;
  } = {
    rotatedTokens: null,
    shouldClearCookies: false,
  };

  const fetchAutocomplete =
    deps?.fetchAutocomplete ??
    ((q: string) =>
      api.GET("/api/v1/geocoding/autocomplete", {
        params: { query: { q } },
        cache: "no-store",
      }));

  const runRefresh = deps?.runWithRefresh ?? runWithServerActionRefresh;

  try {
    const result = await runRefresh(
      () => fetchAutocomplete(parsed.data.q),
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
        "Session refresh service is temporarily unavailable.",
      );
    }

    const status = result.response.ok ? 502 : result.response.status || 500;
    const problem = extractProblemDetails(
      result.error,
      resolveStatusFallbackCode(status),
      GEOCODING_BFF_INSTANCE,
    );
    const sessionInvalidated =
      status === 401 && isConfirmedInvalidRefresh(result.refreshOutcome);

    const response = buildProblemJsonResponse(status, problem, {
      sessionInvalidated,
    });
    if (cookieState.shouldClearCookies || sessionInvalidated) {
      clearSessionCookies(response.cookies, deps?.isSecure);
    } else if (cookieState.rotatedTokens) {
      applySessionCookies(
        response.cookies,
        cookieState.rotatedTokens,
        deps?.isSecure,
      );
    }
    return response;
  } catch {
    return syntheticProblemResponse(
      503,
      API_ERROR_CODES.GEOCODING_UNAVAILABLE,
      "Unable to reach GreenRoots Farm geocoding service.",
    );
  }
}
