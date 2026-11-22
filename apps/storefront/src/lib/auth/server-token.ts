import { AsyncLocalStorage } from "node:async_hooks";
import { cookies, headers } from "next/headers";
import { ACCESS_TOKEN_COOKIE, REFRESHED_ACCESS_TOKEN_HEADER } from "./cookies";

/**
 * Per-invocation store holding an access token rotated inside a Server Action retry
 * so `api-client.ts` prefers it over any stale proxy header in the same request.
 */
export const actionRefreshedTokenStorage = new AsyncLocalStorage<string>();

/**
 * Resolves the active server-side access token following strict precedence:
 * Server Action retry token -> Proxy proactive-refresh header -> `httpOnly` cookie.
 *
 * @returns Bearer access token string if available in the active request scope, else `undefined`.
 */
export async function readServerAccessToken(): Promise<string | undefined> {
  const actionToken = actionRefreshedTokenStorage.getStore();
  if (actionToken) {
    return actionToken;
  }

  const [headerStore, cookieStore] = await Promise.all([headers(), cookies()]);
  return (
    headerStore.get(REFRESHED_ACCESS_TOKEN_HEADER) ??
    cookieStore.get(ACCESS_TOKEN_COOKIE)?.value
  );
}
