import { env } from "@/env";

export const ACCESS_TOKEN_COOKIE = "accessToken";
export const REFRESH_TOKEN_COOKIE = "refreshToken";
export const REFRESHED_ACCESS_TOKEN_HEADER = "x-gr-refreshed-access-token";

/**
 * Internal request/response header signalling transient auth refresh degradation on protected routes.
 */
export const AUTH_DEGRADED_HEADER = "x-gr-auth-degraded";

export const ACCESS_TOKEN_MAX_AGE_SECONDS = 900;
export const REFRESH_TOKEN_MAX_AGE_SECONDS = 604_800;
export const DEFAULT_REFRESH_SKEW_SECONDS = 60;

export const PROTECTED_ROUTE_PREFIXES = ["/account", "/orders"] as const;

/**
 * Cookie attributes enforced for Storefront BFF `httpOnly` session cookies.
 */
export interface SessionCookieOptions {
  readonly httpOnly: true;
  readonly sameSite: "lax";
  readonly path: "/";
  readonly secure: boolean;
  readonly maxAge: number;
}

/**
 * Minimal cookie jar write contract compatible with Next.js `cookies()` and `NextResponse.cookies`.
 */
export interface CookieWriter {
  set(name: string, value: string, options: SessionCookieOptions): void;
}

/**
 * Pair of short-lived JWT access token and opaque single-use refresh token.
 */
export interface SessionTokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
}

/**
 * Builds hardened `httpOnly` cookie attributes for Storefront BFF session cookies.
 *
 * @param kind Whether the cookie holds the 15-minute access token or 7-day refresh token.
 * @param isSecure Whether the `Secure` attribute should be enabled (defaults to production mode).
 * @param maxAgeOverride Optional max-age override in seconds (e.g. `0` for deletion).
 * @returns Cookie attribute configuration object compatible with Next.js cookie stores.
 */
export function buildSessionCookieOptions(
  kind: "access" | "refresh",
  isSecure = env.NODE_ENV === "production",
  maxAgeOverride?: number,
): SessionCookieOptions {
  const defaultMaxAge =
    kind === "access"
      ? ACCESS_TOKEN_MAX_AGE_SECONDS
      : REFRESH_TOKEN_MAX_AGE_SECONDS;

  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isSecure,
    maxAge: maxAgeOverride ?? defaultMaxAge,
  };
}

/**
 * Persists a freshly issued access and refresh token pair into `httpOnly` cookies.
 *
 * @param writer Target Next.js `cookies()` store or `NextResponse.cookies` jar.
 * @param tokens Token pair returned by `/auth/customer/login` or `/auth/customer/refresh`.
 * @param isSecure Optional `Secure` flag override.
 */
export function applySessionCookies(
  writer: CookieWriter,
  tokens: SessionTokenPair,
  isSecure = env.NODE_ENV === "production",
): void {
  writer.set(
    ACCESS_TOKEN_COOKIE,
    tokens.accessToken,
    buildSessionCookieOptions("access", isSecure),
  );
  writer.set(
    REFRESH_TOKEN_COOKIE,
    tokens.refreshToken,
    buildSessionCookieOptions("refresh", isSecure),
  );
}

/**
 * Clears both Storefront authentication cookies immediately (`maxAge = 0`).
 *
 * @param writer Target Next.js `cookies()` store or `NextResponse.cookies` jar.
 * @param isSecure Optional `Secure` flag override.
 */
export function clearSessionCookies(
  writer: CookieWriter,
  isSecure = env.NODE_ENV === "production",
): void {
  writer.set(
    ACCESS_TOKEN_COOKIE,
    "",
    buildSessionCookieOptions("access", isSecure, 0),
  );
  writer.set(
    REFRESH_TOKEN_COOKIE,
    "",
    buildSessionCookieOptions("refresh", isSecure, 0),
  );
}

/**
 * Decodes the `exp` claim from a JWT payload without verifying its signature.
 * Used strictly for proactive refresh scheduling; signature and revocation checks stay in NestJS.
 *
 * @param token Raw JWT access token string.
 * @returns Expiration Unix timestamp in seconds, or `null` if malformed.
 */
export function parseJwtExpirySeconds(token: string): number | null {
  const segments = token.split(".");
  if (segments.length !== 3) {
    return null;
  }

  const payloadSegment = segments[1];
  if (!payloadSegment) {
    return null;
  }

  try {
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const decodedJson = atob(padded);
    const parsed: unknown = JSON.parse(decodedJson);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "exp" in parsed &&
      typeof parsed.exp === "number" &&
      Number.isFinite(parsed.exp)
    ) {
      return parsed.exp;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Determines whether the Storefront BFF should proactively rotate the session before rendering.
 *
 * @param accessToken Current `accessToken` cookie value, if present.
 * @param refreshToken Current `refreshToken` cookie value, if present.
 * @param nowSeconds Current Unix epoch in seconds (injectable for deterministic tests).
 * @param skewSeconds Proactive refresh lead window in seconds.
 * @returns `true` when `refreshToken` is present and `accessToken` is missing or near expiry.
 */
export function shouldProactivelyRefresh(
  accessToken: string | undefined,
  refreshToken: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
  skewSeconds = DEFAULT_REFRESH_SKEW_SECONDS,
): boolean {
  if (!refreshToken) {
    return false;
  }

  if (!accessToken) {
    return true;
  }

  const expSeconds = parseJwtExpirySeconds(accessToken);
  if (expSeconds === null) {
    return true;
  }

  return expSeconds - nowSeconds < skewSeconds;
}

/**
 * Sanitizes post-login redirect targets to prevent open-redirect vulnerabilities.
 *
 * @param raw Candidate redirect path from query params or request URL.
 * @returns Valid relative Storefront path starting with a single `/`, defaulting to `/`.
 */
export function sanitizeRedirectPath(raw: string | null | undefined): string {
  if (!raw) {
    return "/";
  }

  const trimmed = raw.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\")
  ) {
    return "/";
  }

  try {
    const parsed = new URL(trimmed, "http://localhost");
    if (parsed.origin !== "http://localhost") {
      return "/";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

/**
 * Checks whether a Storefront pathname requires an authenticated customer session.
 *
 * @param pathname Normalized URL pathname.
 * @returns `true` for `/account/*` and `/orders/*` subtrees.
 */
export function isProtectedStorefrontPath(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
