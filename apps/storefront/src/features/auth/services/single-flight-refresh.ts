import { createHash } from "node:crypto";
import { env } from "@/env";
import { buildForwardedClientHeaders } from "@/features/auth/services/client-headers";
import type { ApiSuccessResponse } from "@/types/api";
import type { components } from "@/types/api-schema";

const GRACE_WINDOW_MS = 5_000;
const MAX_GRACE_ENTRIES = 1_000;
const REFRESH_FETCH_TIMEOUT_MS = 8_000;

/**
 * Outcome returned by `refreshSingleFlight()` guiding proxy and Server Action cookie handling.
 */
export type SingleFlightRefreshResult =
  | {
      readonly status: "rotated";
      readonly accessToken: string;
      readonly refreshToken: string;
    }
  | { readonly status: "stale_concurrent" }
  | { readonly status: "invalid" }
  | { readonly status: "transient_error" };

/**
 * Injectable transport function calling `POST /api/v1/auth/refresh`.
 */
export type RefreshFetcher = (
  refreshToken: string,
  clientHeaders?: Record<string, string>,
) => Promise<Response>;

/**
 * Optional clock, transport, and forwarded client header overrides.
 */
export interface RefreshSingleFlightOptions {
  readonly fetcher?: RefreshFetcher;
  readonly now?: () => number;
  readonly clientHeaders?: Record<string, string>;
}

type RefreshApiEnvelope = ApiSuccessResponse<
  components["schemas"]["RefreshResponseDto"]
>;

const inflightRefreshes = new Map<string, Promise<SingleFlightRefreshResult>>();
const recentlyRotated = new Map<string, number>();

function hashRefreshToken(refreshToken: string): string {
  return createHash("sha256").update(refreshToken).digest("hex");
}

function pruneExpiredGraceMarkers(nowMs: number): void {
  if (recentlyRotated.size === 0) {
    return;
  }

  for (const [digest, expiresAtMs] of recentlyRotated) {
    if (expiresAtMs <= nowMs) {
      recentlyRotated.delete(digest);
    }
  }

  // Bound memory in case an attacker floods distinct token digests within one 5s window.
  while (recentlyRotated.size > MAX_GRACE_ENTRIES) {
    const oldestKey = recentlyRotated.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    recentlyRotated.delete(oldestKey);
  }
}

async function defaultRefreshFetcher(
  refreshToken: string,
  clientHeaders?: Record<string, string>,
): Promise<Response> {
  const forwarded = clientHeaders ?? buildForwardedClientHeaders(undefined);
  return fetch(`${env.API_BASE_URL}/api/v1/auth/refresh`, {
    method: "POST",
    headers: {
      ...forwarded,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
    signal: AbortSignal.timeout(REFRESH_FETCH_TIMEOUT_MS),
  });
}

async function executeRefresh(
  digest: string,
  refreshToken: string,
  fetcher: RefreshFetcher,
  now: () => number,
  clientHeaders?: Record<string, string>,
): Promise<SingleFlightRefreshResult> {
  try {
    const response = await fetcher(refreshToken, clientHeaders);

    if (response.ok) {
      const payload = (await response.json()) as Partial<RefreshApiEnvelope>;
      const nextAccess = payload.data?.accessToken;
      const nextRefresh = payload.data?.refreshToken;
      if (typeof nextAccess === "string" && typeof nextRefresh === "string") {
        const nowMs = now();
        recentlyRotated.set(digest, nowMs + GRACE_WINDOW_MS);
        pruneExpiredGraceMarkers(nowMs);
        return {
          status: "rotated",
          accessToken: nextAccess,
          refreshToken: nextRefresh,
        };
      }
      return { status: "invalid" };
    }

    if (response.status === 400 || response.status === 401) {
      const nowMs = now();
      pruneExpiredGraceMarkers(nowMs);
      const graceExpiresAt = recentlyRotated.get(digest);
      if (graceExpiresAt !== undefined && graceExpiresAt > nowMs) {
        return { status: "stale_concurrent" };
      }
      return { status: "invalid" };
    }

    // Preserve session cookies on rate-limit bursts (429) and backend 5xx outages.
    return { status: "transient_error" };
  } catch {
    return { status: "transient_error" };
  }
}

/**
 * Coalesces concurrent `POST /api/v1/auth/refresh` requests keyed by `sha256(refreshToken)`
 * so single-use refresh tokens (`ADR-0015`) are never self-invalidated by parallel SSR/action calls.
 *
 * @param refreshToken Raw opaque refresh token from `httpOnly` cookie.
 * @param options Optional injectable `fetcher`, `now` clock, and forwarded `clientHeaders`.
 * @returns Rotation outcome indicating whether cookies should be updated, preserved, or cleared.
 */
export async function refreshSingleFlight(
  refreshToken: string,
  options?: RefreshSingleFlightOptions,
): Promise<SingleFlightRefreshResult> {
  const now = options?.now ?? Date.now;
  const fetcher = options?.fetcher ?? defaultRefreshFetcher;
  const digest = hashRefreshToken(refreshToken);

  const nowMs = now();
  pruneExpiredGraceMarkers(nowMs);
  // Short-circuit late tab/prefetch requests whose token rotated within the 5s grace window
  // without burning the 10/min backend refresh rate-limit budget or clearing valid cookies.
  const graceExpiresAt = recentlyRotated.get(digest);
  if (graceExpiresAt !== undefined && graceExpiresAt > nowMs) {
    return { status: "stale_concurrent" };
  }

  const existing = inflightRefreshes.get(digest);
  if (existing) {
    return existing;
  }

  const refreshPromise = executeRefresh(
    digest,
    refreshToken,
    fetcher,
    now,
    options?.clientHeaders,
  ).finally(() => {
    inflightRefreshes.delete(digest);
  });
  inflightRefreshes.set(digest, refreshPromise);

  return refreshPromise;
}

/**
 * Clears in-memory coalescing maps between isolated unit test cases.
 */
export function resetSingleFlightStateForTests(): void {
  inflightRefreshes.clear();
  recentlyRotated.clear();
}
