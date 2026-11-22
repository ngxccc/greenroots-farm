import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_ERROR_CODES } from "@greenroots/shared";
import { env } from "@/env";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  clearSessionCookies,
} from "./cookies";
import { isSameOriginMutationRequest } from "./csrf";

/**
 * Fetch signature used by the logout handler when revoking sessions with NestJS.
 */
export type BackendFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Optional dependency overrides for isolated unit testing of `handleLogoutPost`.
 */
export interface LogoutHandlerDeps {
  readonly allowedAppUrl?: string;
  readonly isSecure?: boolean;
  readonly readCookies?: () => Promise<{
    accessToken?: string;
    refreshToken?: string;
  }>;
  readonly backendFetch?: BackendFetch;
}

async function defaultReadCookies(): Promise<{
  accessToken?: string;
  refreshToken?: string;
}> {
  const cookieStore = await cookies();
  return {
    accessToken: cookieStore.get(ACCESS_TOKEN_COOKIE)?.value,
    refreshToken: cookieStore.get(REFRESH_TOKEN_COOKIE)?.value,
  };
}

/**
 * Handles `POST /api/auth/logout` from the Storefront browser client.
 * Enforces same-origin CSRF checks, revokes the session in NestJS best-effort,
 * and always clears both `httpOnly` session cookies locally.
 *
 * @param request Incoming HTTP request.
 * @param deps Optional dependency overrides for unit testing.
 * @returns `200` JSON success envelope with cleared cookies, or `403` RFC 9457 problem response.
 */
export async function handleLogoutPost(
  request: Request,
  deps?: LogoutHandlerDeps,
): Promise<NextResponse> {
  const allowedAppUrl = deps?.allowedAppUrl ?? env.NEXT_PUBLIC_APP_URL;
  if (!isSameOriginMutationRequest(request, allowedAppUrl)) {
    return NextResponse.json(
      {
        type: "/errors/forbidden",
        title: "Forbidden",
        status: 403,
        code: API_ERROR_CODES.FORBIDDEN,
        detail: "Cross-origin logout requests are not permitted.",
        instance: "/api/auth/logout",
        timestamp: new Date().toISOString(),
      },
      {
        status: 403,
        headers: { "Content-Type": "application/problem+json" },
      },
    );
  }

  const readCookies = deps?.readCookies ?? defaultReadCookies;
  const backendFetch = deps?.backendFetch ?? fetch;
  const { accessToken, refreshToken } = await readCookies();

  if (refreshToken) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      await backendFetch(`${env.API_BASE_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers,
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
      });
    } catch {
      // Clear browser cookies even when backend revocation fails or token already expired.
    }
  }

  const response = NextResponse.json(
    { success: true, data: null },
    { status: 200 },
  );
  clearSessionCookies(response.cookies, deps?.isSecure);
  return response;
}
