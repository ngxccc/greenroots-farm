import { cookies, headers } from "next/headers";
import { cache } from "react";
import {
  API_ERROR_CODES,
  UserRole,
  resolveSharedApiErrorMessage,
} from "@greenroots/shared";
import { api } from "@/lib/api-client";
import type { CustomerAddress } from "@/features/account/types/address.types";
import type {
  CustomerActiveSession,
  StorefrontSessionUser,
} from "@/features/auth/types/auth.types";
import {
  AUTH_DEGRADED_HEADER,
  REFRESH_TOKEN_COOKIE,
  type SessionTokenPair,
  applySessionCookies,
  clearSessionCookies,
} from "@/features/auth/services/cookies";
import {
  actionRefreshedTokenStorage,
  readServerAccessToken,
} from "@/features/auth/services/server-token";
import { readServerActionClientHeaders } from "@/features/auth/services/client-headers";
import { refreshSingleFlight } from "@/features/auth/services/single-flight-refresh";

export type { StorefrontSessionUser } from "@/features/auth/types/auth.types";

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
const fetchCachedAddresses = cache(async () =>
  api.GET("/api/v1/users/me/addresses"),
);
const fetchCachedCustomerSessions = cache(async () =>
  api.GET("/api/v1/auth/customer/sessions", { cache: "no-store" }),
);

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
    if (error || !data || data.data.role !== UserRole.CUSTOMER) {
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
  readonly readClientHeaders?: () => Promise<Record<string, string>>;
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
  rotatedAccessToken?: string;
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

  const readClientHeaders =
    deps?.readClientHeaders ?? readServerActionClientHeaders;
  const clientHeaders = await readClientHeaders();
  const refresh = deps?.refresh ?? refreshSingleFlight;
  const refreshOutcome = await refresh(refreshToken, { clientHeaders });

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
    return {
      ...retried,
      refreshOutcome: "rotated",
      rotatedAccessToken: tokens.accessToken,
    };
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

function isProblemObject(error: unknown): error is Record<string, unknown> {
  return typeof error === "object" && error !== null;
}

function extractProblemStatus(error: unknown): number | undefined {
  return isProblemObject(error) && typeof error.status === "number"
    ? error.status
    : undefined;
}

function extractProblemCode(error: unknown): string | undefined {
  return isProblemObject(error) && typeof error.code === "string"
    ? error.code
    : undefined;
}

function resolveSessionsDegradedMessage(result: {
  readonly response?: { readonly status: number };
  readonly error?: unknown;
}): string {
  const status = result.response?.status ?? extractProblemStatus(result.error);
  const code =
    extractProblemCode(result.error) ??
    (status === 429
      ? API_ERROR_CODES.TOO_MANY_REQUESTS
      : API_ERROR_CODES.SERVICE_UNAVAILABLE);
  return resolveSharedApiErrorMessage(code);
}

async function defaultIsAuthDegraded(): Promise<boolean> {
  const headerStore = await headers();
  return headerStore.get(AUTH_DEGRADED_HEADER) === "1";
}

function classifyFetchOutcome(
  result: {
    readonly response?: { readonly status: number };
    readonly error?: unknown;
  },
  hasData: boolean,
): "ok" | "unauthenticated" | "degraded" {
  if (!result.error && hasData) {
    return "ok";
  }

  const errorStatus =
    result.response?.status ?? extractProblemStatus(result.error);
  return errorStatus === 401 ? "unauthenticated" : "degraded";
}

async function checkProtectedSessionGate(
  deps?: AccountProfileSessionDeps,
): Promise<
  | { readonly ready: true }
  | { readonly ready: false; readonly status: "degraded" | "unauthenticated" }
> {
  const checkDegraded = deps?.isDegraded ?? defaultIsAuthDegraded;
  if (await checkDegraded()) {
    return { ready: false, status: "degraded" };
  }

  const readToken = deps?.readToken ?? readServerAccessToken;
  const accessToken = await readToken();
  if (!accessToken) {
    return { ready: false, status: "unauthenticated" };
  }

  return { ready: true };
}

type MeFetchResult = {
  readonly response?: { readonly status: number };
  readonly data?: { data: StorefrontSessionUser };
  readonly error?: unknown;
};

function resolveAuthenticatedCustomerProfile(
  meResult: MeFetchResult,
): AccountProfileSessionResolution {
  const outcome = classifyFetchOutcome(meResult, Boolean(meResult.data?.data));
  if (outcome === "unauthenticated") {
    return { status: "unauthenticated" };
  }
  if (outcome !== "ok" || !meResult.data?.data) {
    return { status: "degraded" };
  }
  if (meResult.data.data.role !== UserRole.CUSTOMER) {
    return { status: "unauthenticated" };
  }
  return { status: "authenticated", user: meResult.data.data };
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
    const gate = await checkProtectedSessionGate(deps);
    if (!gate.ready) {
      return { status: gate.status };
    }

    const fetchMe = deps?.fetchMe ?? fetchCachedMe;
    return resolveAuthenticatedCustomerProfile(await fetchMe());
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

/**
 * Discriminated active-sessions sub-state rendered inside the `/account/profile` security section.
 */
export type CustomerSessionsState =
  | {
      readonly status: "loaded";
      readonly sessions: readonly CustomerActiveSession[];
    }
  | {
      readonly status: "degraded";
      readonly errorMessage: string;
    };

/**
 * Discriminated SSR outcome for `/account/profile` hydrating both user profile and active sessions.
 */
export type AccountProfileWithSessionsResolution =
  | {
      readonly status: "authenticated";
      readonly user: StorefrontSessionUser;
      readonly sessionsState: CustomerSessionsState;
    }
  | { readonly status: "unauthenticated" }
  | { readonly status: "degraded" };

/**
 * Optional dependency overrides for isolated unit testing of `resolveAccountProfileWithSessions`.
 */
export interface AccountProfileWithSessionsDeps extends AccountProfileSessionDeps {
  readonly fetchCustomerSessions?: () => Promise<{
    response?: { readonly status: number };
    data?: { data: CustomerActiveSession[] };
    error?: unknown;
  }>;
}

/**
 * Resolves customer identity alongside live active customer sessions for `/account/profile`.
 * Preserves profile rendering with an inline degraded sessions sub-state when only the
 * sessions endpoint fails transiently (`5xx`/`429`), while rejecting `401` and non-customer roles.
 *
 * @param deps Optional header, token, profile, and sessions fetch overrides for tests.
 * @returns Authenticated profile + active sessions sub-state, `unauthenticated`, or `degraded`.
 */
export async function resolveAccountProfileWithSessions(
  deps?: AccountProfileWithSessionsDeps,
): Promise<AccountProfileWithSessionsResolution> {
  try {
    const gate = await checkProtectedSessionGate(deps);
    if (!gate.ready) {
      return { status: gate.status };
    }

    const fetchMe = deps?.fetchMe ?? fetchCachedMe;
    const fetchCustomerSessions =
      deps?.fetchCustomerSessions ?? fetchCachedCustomerSessions;

    const safeSessionsPromise: Promise<{
      readonly response?: { readonly status: number };
      readonly data?: { data: CustomerActiveSession[] };
      readonly error?: unknown;
    }> = fetchCustomerSessions().catch(() => ({
      response: { status: 503 },
      error: {
        status: 503,
        code: API_ERROR_CODES.SERVICE_UNAVAILABLE,
      },
    }));

    const [meResult, sessionsResult] = await Promise.all([
      fetchMe(),
      safeSessionsPromise,
    ]);

    const profile = resolveAuthenticatedCustomerProfile(meResult);
    if (profile.status !== "authenticated") {
      return profile;
    }

    const sessionsArray = sessionsResult.data?.data;
    const sessionsOutcome = classifyFetchOutcome(
      sessionsResult,
      Array.isArray(sessionsArray),
    );
    if (sessionsOutcome === "unauthenticated") {
      return { status: "unauthenticated" };
    }

    const sessionsState: CustomerSessionsState =
      sessionsOutcome === "ok" && Array.isArray(sessionsArray)
        ? { status: "loaded", sessions: sessionsArray }
        : {
            status: "degraded",
            errorMessage: resolveSessionsDegradedMessage(sessionsResult),
          };

    return {
      status: "authenticated",
      user: profile.user,
      sessionsState,
    };
  } catch {
    return { status: "degraded" };
  }
}

/**
 * Per-request memoized protected `/account/profile` resolver hydrating user profile and active sessions (`React.cache`).
 */
export const getAccountProfileWithSessions = cache(
  async (): Promise<AccountProfileWithSessionsResolution> =>
    resolveAccountProfileWithSessions(),
);

/**
 * Discriminated SSR outcome for protected `/account/addresses` route (`INV-SF-ADDR-4`).
 */
export type AccountAddressesSessionResolution =
  | {
      readonly status: "authenticated";
      readonly user: StorefrontSessionUser;
      readonly addresses: readonly CustomerAddress[];
    }
  | { readonly status: "unauthenticated" }
  | { readonly status: "degraded" };

/**
 * Optional dependency overrides for isolated unit testing of `resolveHeaderAddresses` and `resolveAccountAddressesSession`.
 */
export interface AccountAddressesSessionDeps extends AccountProfileSessionDeps {
  readonly fetchAddresses?: () => Promise<{
    response?: { readonly status: number };
    data?: { data: CustomerAddress[] };
    error?: unknown;
  }>;
}

/**
 * Resolves saved delivery addresses fail-open (`null` on guest or upstream error) for `HeaderAuthSlot`.
 *
 * @param deps Optional token reader and address fetcher overrides for unit testing.
 * @returns Ordered `CustomerAddress[]` or `null` when unavailable.
 */
export async function resolveHeaderAddresses(
  deps?: Pick<AccountAddressesSessionDeps, "readToken" | "fetchAddresses">,
): Promise<readonly CustomerAddress[] | null> {
  try {
    const readToken = deps?.readToken ?? readServerAccessToken;
    const accessToken = await readToken();
    if (!accessToken) {
      return null;
    }

    const fetchAddresses = deps?.fetchAddresses ?? fetchCachedAddresses;
    const { data, error } = await fetchAddresses();
    if (error || !data?.data) {
      return null;
    }
    return data.data;
  } catch {
    return null;
  }
}

/**
 * Per-request memoized customer address list resolver for `StorefrontHeader` `<Suspense>` hydration.
 */
export const getHeaderAddresses = cache(
  async (): Promise<readonly CustomerAddress[] | null> =>
    resolveHeaderAddresses(),
);

/**
 * Resolves both authenticated profile and saved delivery addresses for `/account/addresses`,
 * separating terminal `401` redirects from transient `5xx` or proxy degradation (`INV-SF-ADDR-4`).
 *
 * @param deps Optional header, token, profile, and address fetcher overrides for unit testing.
 * @returns Discriminated `authenticated`, `unauthenticated`, or `degraded` state.
 */
export async function resolveAccountAddressesSession(
  deps?: AccountAddressesSessionDeps,
): Promise<AccountAddressesSessionResolution> {
  try {
    const gate = await checkProtectedSessionGate(deps);
    if (!gate.ready) {
      return { status: gate.status };
    }

    const fetchMe = deps?.fetchMe ?? fetchCachedMe;
    const fetchAddresses = deps?.fetchAddresses ?? fetchCachedAddresses;
    const [meResult, addressesResult] = await Promise.all([
      fetchMe(),
      fetchAddresses(),
    ]);

    const profile = resolveAuthenticatedCustomerProfile(meResult);
    const addressesOutcome = classifyFetchOutcome(
      addressesResult,
      Boolean(addressesResult.data?.data),
    );

    if (
      profile.status === "unauthenticated" ||
      addressesOutcome === "unauthenticated"
    ) {
      return { status: "unauthenticated" };
    }

    if (
      profile.status !== "authenticated" ||
      addressesOutcome !== "ok" ||
      !addressesResult.data?.data
    ) {
      return { status: "degraded" };
    }

    return {
      status: "authenticated",
      user: profile.user,
      addresses: addressesResult.data.data,
    };
  } catch {
    return { status: "degraded" };
  }
}

/**
 * Per-request memoized protected address-book session resolver (`React.cache`).
 */
export const getAccountAddressesSession = cache(
  async (): Promise<AccountAddressesSessionResolution> =>
    resolveAccountAddressesSession(),
);
