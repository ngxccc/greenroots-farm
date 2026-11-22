import { cookies } from "next/headers";
import { cache } from "react";
import { api } from "@/lib/api-client";
import type { StorefrontSessionUser } from "@/types/auth.types";
import {
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

    const fetchMe = deps?.fetchMe ?? (() => api.GET("/api/v1/users/me"));
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
 * Executes a Server Action API operation with single-retry single-flight refresh on `401`.
 * Never invoke from React Server Components because RSCs cannot mutate response cookies.
 *
 * @param operation Callback executing an authenticated `api.*` call.
 * @param deps Optional injectable cookie/refresh adapters for unit testing.
 * @returns Final API response envelope after at most one token rotation retry.
 */
export async function runWithServerActionRefresh<T>(
  operation: () => Promise<{ response: Response; data?: T; error?: unknown }>,
  deps?: ServerActionRefreshDeps,
): Promise<{ response: Response; data?: T; error?: unknown }> {
  const initialResult = await operation();
  if (initialResult.response.status !== 401) {
    return initialResult;
  }

  const refreshToken = deps?.readRefreshToken
    ? await deps.readRefreshToken()
    : (await cookies()).get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) {
    return initialResult;
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
    return actionRefreshedTokenStorage.run(tokens.accessToken, operation);
  }

  if (refreshOutcome.status === "invalid") {
    if (deps?.clearTokens) {
      await deps.clearTokens();
    } else {
      const cookieStore = await cookies();
      clearSessionCookies(cookieStore);
    }
  }

  return initialResult;
}
