import {
  API_ERROR_CODES,
  resolveSharedApiErrorMessage,
} from "@greenroots/shared";
import createClient from "openapi-fetch";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import type { components, paths } from "@/types/api-schema";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  (typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:3002");

const AUTH_REFRESH_BYPASS_PATHS = [
  "/api/v1/auth/staff/login",
  "/api/v1/auth/staff/refresh",
  "/api/v1/auth/logout",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password",
] as const;

const SESSION_INVALIDATING_403_CODES = new Set<string>([
  API_ERROR_CODES.AUTH_SURFACE_FORBIDDEN,
  API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED,
]);

type StaffAuthPayload = components["schemas"]["StaffAuthResponseDto"];
type ApiEnvelope<T> = { success: boolean; data: T };

let refreshPromise: Promise<StaffAuthPayload | null> | null = null;
let initialRefreshAttempted = false;
let unauthorizedRedirectHandler: (() => void) | null = null;

/**
 * Registers the router navigation callback invoked when a session is invalidated.
 */
export function setUnauthorizedRedirectHandler(handler: () => void): void {
  unauthorizedRedirectHandler = handler;
}

/**
 * Resets internal refresh coordination state (intended for unit tests).
 */
export function resetAuthClientStateForTest(): void {
  refreshPromise = null;
  initialRefreshAttempted = false;
}

function isAuthRefreshBypass(url: string): boolean {
  return AUTH_REFRESH_BYPASS_PATHS.some((path) => url.includes(path));
}

function invalidateSessionAndRedirect(): void {
  useAuthStore.getState().clearSession();
  initialRefreshAttempted = true;
  unauthorizedRedirectHandler?.();
}

/**
 * Performs a single-flight staff session refresh via the HttpOnly refresh cookie.
 */
export async function refreshStaffSession(): Promise<StaffAuthPayload | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await globalThis.fetch(
        `${API_BASE_URL}/api/v1/auth/staff/refresh`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        invalidateSessionAndRedirect();
        return null;
      }

      const envelope = (await response.json()) as Partial<
        ApiEnvelope<StaffAuthPayload>
      > | null;
      const payload = envelope?.data;
      if (!payload?.accessToken) {
        invalidateSessionAndRedirect();
        return null;
      }

      useAuthStore.getState().setSession(payload.accessToken, payload.user);
      initialRefreshAttempted = true;
      return payload;
    } catch {
      invalidateSessionAndRedirect();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Ensures an in-memory staff session exists, attempting a single silent refresh on cold reload.
 */
export async function ensureStaffSession(): Promise<boolean> {
  if (useAuthStore.getState().accessToken && useAuthStore.getState().user) {
    return true;
  }
  if (initialRefreshAttempted) {
    return false;
  }
  const refreshed = await refreshStaffSession();
  initialRefreshAttempted = true;
  return refreshed !== null;
}

/**
 * Revokes the active staff session via the API and clears in-memory state.
 */
export async function logoutStaffSession(): Promise<void> {
  try {
    await api.POST("/api/v1/auth/logout", { body: {} });
  } catch {
    // Always clear local session even if network revocation fails.
  } finally {
    useAuthStore.getState().clearSession();
    initialRefreshAttempted = true;
  }
}

/**
 * Extracts a localized Vietnamese error message from an RFC 9457 API error payload.
 */
export function extractApiErrorMessage(
  error: unknown,
  fallback = "Đã có lỗi xảy ra. Vui lòng thử lại.",
): string {
  if (!error || typeof error !== "object") {
    return fallback;
  }
  const problem = error as {
    code?: string;
    detail?: string;
    invalidParams?: { params?: Record<string, unknown> }[];
  };
  return resolveSharedApiErrorMessage(
    problem.code,
    problem.invalidParams?.[0]?.params,
    problem.detail ?? fallback,
  );
}

async function authFetch(input: Request): Promise<Response> {
  const token = useAuthStore.getState().accessToken;
  if (token && !input.headers.has("Authorization")) {
    input.headers.set("Authorization", `Bearer ${token}`);
  }

  const retryClone = input.clone();
  const response = await globalThis.fetch(input);

  if (response.status === 401 && !isAuthRefreshBypass(input.url)) {
    const refreshed = await refreshStaffSession();
    if (!refreshed) {
      return response;
    }
    retryClone.headers.set("Authorization", `Bearer ${refreshed.accessToken}`);
    return globalThis.fetch(retryClone);
  }

  if (response.status === 403 && !isAuthRefreshBypass(input.url)) {
    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as { code?: string } | null;
    if (body?.code && SESSION_INVALIDATING_403_CODES.has(body.code)) {
      invalidateSessionAndRedirect();
    }
  }

  return response;
}

export const api = createClient<paths>({
  baseUrl: API_BASE_URL,
  credentials: "include",
  fetch: authFetch,
});

export interface ApiHealthStatus {
  readonly reachable: boolean;
  readonly message: string;
}

export async function fetchApiHealth(): Promise<ApiHealthStatus> {
  try {
    const { data } = await api.GET("/api/v1/health");
    if (!data) {
      return { reachable: false, message: "API tạm thời chưa phản hồi" };
    }
    return { reachable: true, message: data.data.message };
  } catch {
    return { reachable: false, message: "Chưa kết nối tới API :3000" };
  }
}
