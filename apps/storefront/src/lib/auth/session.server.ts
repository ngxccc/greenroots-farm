import { cookies, headers } from "next/headers";
import { cache } from "react";
import { api } from "@/lib/api-client";
import type { StorefrontSessionUser } from "@/types/auth.types";
import {
  AUTH_DEGRADED_HEADER,
  REFRESH_TOKEN_COOKIE,
  type SessionTokenPair,
  applySessionCookies,
  clearSessionCookies,
} from "./cookies";
import {
  actionRefreshedTokenStorage,
  readServerAccessToken,
} from "./server-token";
import { refreshSingleFlight } from "./single-flight-refresh";

export type { StorefrontSessionUser } from "@/types/auth.types";

/**
 * Optional dependency overrides for isolated unit testing of `resolveServerSession`.
 */
export interface ServerSessionDeps {
  readonly readToken?: () => Promise<string | undefined>;
  readonly fetchMe?: () => Promise<{
    data?: { data: StorefrontSessionUser };
    error?: unknown;
  }>;
}

const fetchCachedMe = cache(async () => api.GET("/api/v1/users/me"));

/**
 * Resolves the authenticated customer profile when an access token is present.
 * Exposed for unit tests; server components should call `getServerSession()`.
 *
 * @param deps Optional token reader and profile fetcher overrides.
 * @returns Verified `UserProfileDto` from `GET /api/v1/users/me`, or `null` for guests/revoked sessions.
 */
export async function resolveServerSession(
  deps?: ServerSessionDeps,
): Promise<StorefrontSessionUser | null> {
  try {
    const readToken = deps?.readToken ?? readServerAccessToken;
    const accessToken = await readToken();
    if (!accessToken) {
      return null;
    }

    const fetchMe = deps?.fetchMe ?? fetchCachedMe;
    const { data, error } = await fetchMe();
    if (error || !data) {
      return null;
    }
    return data.data;
  } catch {
    return null;
  }
}

/**
 * Per-request memoized customer session resolver (`React.cache`).
 * Skips upstream calls completely when no access token is present in cookies or forwarded headers.
 */
export const getServerSession = cache(
  async (): Promise<StorefrontSessionUser | null> => resolveServerSession(),
);

/**
 * Persists rotated or newly logged-in tokens into `httpOnly` cookies inside a Server Action or Route Handler.
 *
 * @param tokens Pair of JWT access token and opaque refresh token.
 */
export async function setServerSessionCookies(
  tokens: SessionTokenPair,
): Promise<void> {
  const cookieStore = await cookies();
  applySessionCookies(cookieStore, tokens);
}

/**
 * Clears both authentication `httpOnly` cookies inside a Server Action or Route Handler.
 */
export async function clearServerSessionCookies(): Promise<void> {
  const cookieStore = await cookies();
  clearSessionCookies(cookieStore);
}

/**
 * Optional dependency overrides for isolated unit testing of `runWithServerActionRefresh`.
 */
export interface ServerActionRefreshDeps {
  readonly readRefreshToken?: () => Promise<string | undefined>;
  readonly refresh?: typeof refreshSingleFlight;
  readonly applyTokens?: (tokens: SessionTokenPair) => Promise<void>;
  readonly clearTokens?: () => Promise<void>;
}

/**
 * Refresh status metadata attached to `runWithServerActionRefresh` results so callers
 * can distinguish confirmed invalid sessions from transient refresh failures.
 */
export type ServerActionRefreshOutcome =
  | "not_needed"
  | "rotated"
  | "invalid"
  | "stale_concurrent"
  | "transient_error"
  | "missing_refresh_token";

/**
 * Executes a Server Action API operation with single-retry single-flight refresh on `401`.
 * Never invoke from React Server Components because RSCs cannot mutate response cookies.
 *
 * @param operation Callback executing an authenticated `api.*` call.
 * @param deps Optional injectable cookie/refresh adapters for unit testing.
 * @returns Final API response envelope with `refreshOutcome` status metadata.
 */
export async function runWithServerActionRefresh<T>(
  operation: () => Promise<{ response: Response; data?: T; error?: unknown }>,
  deps?: ServerActionRefreshDeps,
): Promise<{
  response: Response;
  data?: T;
  error?: unknown;
  refreshOutcome?: ServerActionRefreshOutcome;
}> {
  const initialResult = await operation();
  if (initialResult.response.status !== 401) {
    return { ...initialResult, refreshOutcome: "not_needed" };
  }

  const refreshToken = deps?.readRefreshToken
    ? await deps.readRefreshToken()
    : (await cookies()).get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) {
    return { ...initialResult, refreshOutcome: "missing_refresh_token" };
  }

  const refresh = deps?.refresh ?? refreshSingleFlight;
  const refreshOutcome = await refresh(refreshToken);

  if (refreshOutcome.status === "rotated") {
    const tokens: SessionTokenPair = {
      accessToken: refreshOutcome.accessToken,
      refreshToken: refreshOutcome.refreshToken,
    };
    if (deps?.applyTokens) {
      await deps.applyTokens(tokens);
    } else {
      const cookieStore = await cookies();
      applySessionCookies(cookieStore, tokens);
    }
    const retried = await actionRefreshedTokenStorage.run(
      tokens.accessToken,
      operation,
    );
    return { ...retried, refreshOutcome: "rotated" };
  }

  if (refreshOutcome.status === "invalid") {
    if (deps?.clearTokens) {
      await deps.clearTokens();
    } else {
      const cookieStore = await cookies();
      clearSessionCookies(cookieStore);
    }
  }

  return { ...initialResult, refreshOutcome: refreshOutcome.status };
}

/**
 * Discriminated SSR outcome for protected Storefront account routes (`INV-SF-PROFILE-1`).
 */
export type AccountProfileSessionResolution =
  | { readonly status: "authenticated"; readonly user: StorefrontSessionUser }
  | { readonly status: "unauthenticated" }
  | { readonly status: "degraded" };

/**
 * Optional dependency overrides for isolated unit testing of `resolveAccountProfileSession`.
 */
export interface AccountProfileSessionDeps {
  readonly isDegraded?: () => Promise<boolean>;
  readonly readToken?: () => Promise<string | undefined>;
  readonly fetchMe?: () => Promise<{
    response?: { readonly status: number };
    data?: { data: StorefrontSessionUser };
    error?: unknown;
  }>;
}

function extractProblemStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return undefined;
}

async function defaultIsAuthDegraded(): Promise<boolean> {
  const headerStore = await headers();
  return headerStore.get(AUTH_DEGRADED_HEADER) === "1";
}

/**
 * Resolves customer identity for protected `/account/*` Server Components while distinguishing
 * terminal `401`/missing-token states from transient `5xx` or proxy-degraded failures.
 *
 * @param deps Optional header, token, and profile fetch overrides for tests.
 * @returns Authenticated user profile, `unauthenticated`, or `degraded` state.
 */
export async function resolveAccountProfileSession(
  deps?: AccountProfileSessionDeps,
): Promise<AccountProfileSessionResolution> {
  try {
    const checkDegraded = deps?.isDegraded ?? defaultIsAuthDegraded;
    if (await checkDegraded()) {
      return { status: "degraded" };
    }

    const readToken = deps?.readToken ?? readServerAccessToken;
    const accessToken = await readToken();
    if (!accessToken) {
      return { status: "unauthenticated" };
    }

    const fetchMe = deps?.fetchMe ?? fetchCachedMe;
    const result = await fetchMe();
    if (!result.error && result.data?.data) {
      return { status: "authenticated", user: result.data.data };
    }

    const errorStatus =
      result.response?.status ?? extractProblemStatus(result.error);
    if (errorStatus === 401) {
      return { status: "unauthenticated" };
    }

    return { status: "degraded" };
  } catch {
    return { status: "degraded" };
  }
}

/**
 * Per-request memoized protected account session resolver (`React.cache`).
 */
export const getAccountProfileSession = cache(
  async (): Promise<AccountProfileSessionResolution> =>
    resolveAccountProfileSession(),
);
