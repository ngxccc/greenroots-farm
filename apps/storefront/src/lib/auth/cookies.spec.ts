import { describe, expect, it } from "bun:test";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  buildSessionCookieOptions,
  isProtectedStorefrontPath,
  parseJwtExpirySeconds,
  sanitizeRedirectPath,
  shouldProactivelyRefresh,
} from "./cookies";

function createUnsignedJwtWithExp(expSeconds: number): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub: "user-1", exp: expSeconds }),
  ).toString("base64url");
  return `${header}.${payload}.signature`;
}

describe("Storefront Auth Cookies", () => {
  describe("buildSessionCookieOptions", () => {
    it("sets httpOnly, SameSite=Lax, and aligned maxAge for access and refresh cookies", () => {
      // Invariant: INV-SF-AUTH-1
      // Invariant: INV-SF-AUTH-5
      const accessOpts = buildSessionCookieOptions("access", false);
      const refreshOpts = buildSessionCookieOptions("refresh", true);

      expect(ACCESS_TOKEN_COOKIE).toBe("accessToken");
      expect(REFRESH_TOKEN_COOKIE).toBe("refreshToken");
      expect(accessOpts).toEqual({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: false,
        maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
      });
      expect(accessOpts.maxAge).toBe(900);
      expect(refreshOpts).toEqual({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
        maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
      });
      expect(refreshOpts.maxAge).toBe(604800);
    });
  });

  describe("parseJwtExpirySeconds", () => {
    it("extracts numeric exp claim from valid JWT payload", () => {
      const token = createUnsignedJwtWithExp(1_800_000_000);
      expect(parseJwtExpirySeconds(token)).toBe(1_800_000_000);
    });

    it("returns null for malformed JWT strings", () => {
      expect(parseJwtExpirySeconds("not-a-jwt")).toBeNull();
      expect(parseJwtExpirySeconds("a.!!!.c")).toBeNull();
    });
  });

  describe("shouldProactivelyRefresh", () => {
    const now = 1_700_000_000;

    it("returns false when refreshToken is absent", () => {
      expect(shouldProactivelyRefresh(undefined, undefined, now)).toBe(false);
      expect(
        shouldProactivelyRefresh(
          createUnsignedJwtWithExp(now - 10),
          undefined,
          now,
        ),
      ).toBe(false);
    });

    it("returns true when accessToken cookie is missing but refreshToken exists", () => {
      // Invariant: INV-SF-AUTH-5
      expect(shouldProactivelyRefresh(undefined, "refresh-r1", now)).toBe(true);
    });

    it("returns true when accessToken is expired or within 60-second skew window", () => {
      // Invariant: INV-SF-AUTH-5
      expect(
        shouldProactivelyRefresh(
          createUnsignedJwtWithExp(now + 59),
          "refresh-r1",
          now,
        ),
      ).toBe(true);
      expect(
        shouldProactivelyRefresh(
          createUnsignedJwtWithExp(now - 5),
          "refresh-r1",
          now,
        ),
      ).toBe(true);
    });

    it("returns false when accessToken has more than 60 seconds remaining", () => {
      expect(
        shouldProactivelyRefresh(
          createUnsignedJwtWithExp(now + 120),
          "refresh-r1",
          now,
        ),
      ).toBe(false);
    });
  });

  describe("sanitizeRedirectPath", () => {
    it("preserves safe relative paths with query strings", () => {
      expect(sanitizeRedirectPath("/account/profile?tab=loyalty")).toBe(
        "/account/profile?tab=loyalty",
      );
      expect(sanitizeRedirectPath("/orders/123")).toBe("/orders/123");
    });

    it("rejects protocol-relative, backslash, and external redirect URLs", () => {
      // Invariant: INV-SF-AUTH-6
      expect(sanitizeRedirectPath("//evil.example/phish")).toBe("/");
      expect(sanitizeRedirectPath("/\\evil.example/phish")).toBe("/");
      expect(sanitizeRedirectPath("https://evil.example/login")).toBe("/");
      expect(sanitizeRedirectPath("javascript:alert(1)")).toBe("/");
      expect(sanitizeRedirectPath(undefined)).toBe("/");
    });
  });

  describe("isProtectedStorefrontPath", () => {
    it("matches /account and /orders subtrees while leaving public and checkout routes open", () => {
      expect(isProtectedStorefrontPath("/account")).toBe(true);
      expect(isProtectedStorefrontPath("/account/profile")).toBe(true);
      expect(isProtectedStorefrontPath("/orders")).toBe(true);
      expect(isProtectedStorefrontPath("/orders/0195a8f0/complaint")).toBe(
        true,
      );
      expect(isProtectedStorefrontPath("/")).toBe(false);
      expect(isProtectedStorefrontPath("/products")).toBe(false);
      expect(isProtectedStorefrontPath("/checkout")).toBe(false);
    });
  });
});
