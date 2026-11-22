import { NextResponse, type NextRequest } from "next/server";
import { API_ERROR_CODES } from "@greenroots/shared";
import { isMaintenanceModeEnabled } from "@/env";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESHED_ACCESS_TOKEN_HEADER,
  REFRESH_TOKEN_COOKIE,
  applySessionCookies,
  clearSessionCookies,
  isProtectedStorefrontPath,
  sanitizeRedirectPath,
  shouldProactivelyRefresh,
} from "@/lib/auth/cookies";
import { refreshSingleFlight } from "@/lib/auth/single-flight-refresh";

const SKIP_REFRESH_PATHS = [
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
] as const;
export const AUTH_DEGRADED_HEADER = "x-gr-auth-degraded";
const MAINTENANCE_HEADERS = {
  "Retry-After": "900",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

/**
 * Optional dependency overrides for isolated unit testing of `handleStorefrontProxy`.
 */
export interface StorefrontProxyDeps {
  readonly refresh?: typeof refreshSingleFlight;
  readonly isSecure?: boolean;
  readonly maintenanceMode?: boolean;
}

function buildLoginRedirectResponse(
  request: NextRequest,
  shouldClearCookies: boolean,
  isSecure?: boolean,
): NextResponse {
  const safeRedirect = sanitizeRedirectPath(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", safeRedirect);

  const response = NextResponse.redirect(loginUrl);
  if (shouldClearCookies) {
    clearSessionCookies(response.cookies, isSecure);
  }
  return response;
}

function isPrefetchRequest(request: NextRequest): boolean {
  return (
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch"
  );
}

function shouldSkipProactiveRefresh(pathname: string): boolean {
  return (
    pathname.startsWith("/api/auth/") ||
    SKIP_REFRESH_PATHS.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  );
}

/**
 * Core Next.js Proxy handler managing proactive single-flight token rotation,
 * forwarded SSR request cookies, and protected route redirects.
 *
 * @param request Incoming Next.js request.
 * @param deps Optional injectable dependencies for unit tests.
 * @returns Next.js proxy response (`next()` or `redirect()`).
 */
export async function handleStorefrontProxy(
  request: NextRequest,
  deps?: StorefrontProxyDeps,
): Promise<NextResponse> {
  const requestHeaders = new Headers(request.headers);
  // Strip client-supplied internal headers so external callers cannot spoof proxy state.
  requestHeaders.delete(REFRESHED_ACCESS_TOKEN_HEADER);
  requestHeaders.delete(AUTH_DEGRADED_HEADER);

  const pathname = request.nextUrl.pathname;
  const maintenanceActive = deps?.maintenanceMode ?? isMaintenanceModeEnabled();

  // Short-circuit before proactive refresh so outages never burn refresh tokens.
  if (maintenanceActive) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          type: "/errors/service-unavailable",
          title: "Service Unavailable",
          status: 503,
          code: API_ERROR_CODES.SERVICE_UNAVAILABLE,
          detail: "Storefront is currently undergoing scheduled maintenance.",
          instance: pathname,
          timestamp: new Date().toISOString(),
        },
        {
          status: 503,
          headers: {
            "Content-Type": "application/problem+json",
            ...MAINTENANCE_HEADERS,
          },
        },
      );
    }

    const maintenanceUrl = new URL("/maintenance", request.url);
    return NextResponse.rewrite(maintenanceUrl, {
      status: 503,
      headers: MAINTENANCE_HEADERS,
      request: { headers: requestHeaders },
    });
  }

  const protectedRoute = isProtectedStorefrontPath(pathname);
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  const canRefresh =
    !isPrefetchRequest(request) &&
    !shouldSkipProactiveRefresh(pathname) &&
    shouldProactivelyRefresh(accessToken, refreshToken);

  if (canRefresh && refreshToken) {
    const refresh = deps?.refresh ?? refreshSingleFlight;
    const outcome = await refresh(refreshToken);

    if (outcome.status === "rotated") {
      requestHeaders.set(REFRESHED_ACCESS_TOKEN_HEADER, outcome.accessToken);
      const response = NextResponse.next({
        request: { headers: requestHeaders },
      });
      applySessionCookies(response.cookies, outcome, deps?.isSecure);
      return response;
    }

    if (outcome.status === "invalid") {
      if (protectedRoute) {
        return buildLoginRedirectResponse(request, true, deps?.isSecure);
      }
      const response = NextResponse.next({
        request: { headers: requestHeaders },
      });
      clearSessionCookies(response.cookies, deps?.isSecure);
      return response;
    }

    // Preserve cookies on stale_concurrent or transient_error so valid sessions survive.
    if (outcome.status === "transient_error" && protectedRoute) {
      requestHeaders.set(AUTH_DEGRADED_HEADER, "1");
      const response = NextResponse.next({
        request: { headers: requestHeaders },
      });
      response.headers.set(AUTH_DEGRADED_HEADER, "1");
      return response;
    }

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  if (protectedRoute && !refreshToken) {
    return buildLoginRedirectResponse(
      request,
      Boolean(accessToken),
      deps?.isSecure,
    );
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

/**
 * Next.js 16 request proxy entry point for Storefront session lifecycle management.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  return handleStorefrontProxy(request);
}

export const config = {
  matcher: [
    "/((?!_next/|favicon\\.ico|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
