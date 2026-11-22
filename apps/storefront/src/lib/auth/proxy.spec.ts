import { describe, expect, it } from "bun:test";
import { NextRequest } from "next/server";
import {
  AUTH_DEGRADED_HEADER,
  config,
  handleStorefrontProxy,
} from "../../../proxy";
import { REFRESHED_ACCESS_TOKEN_HEADER } from "./cookies";

function createJwtWithExp(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString(
    "base64url",
  );
  const payload = Buffer.from(
    JSON.stringify({ sub: "user-1", exp: expSeconds }),
  ).toString("base64url");
  return `${header}.${payload}.sig`;
}

describe("Storefront Auth Proxy", () => {
  const nowSec = Math.floor(Date.now() / 1000);

  describe("handleStorefrontProxy", () => {
    it("skips proactive refresh for prefetch requests and auth routes", async () => {
      // Invariant: INV-SF-AUTH-4
      let refreshCalls = 0;
      const prefetchReq = new NextRequest("http://localhost:3001/products", {
        headers: {
          "next-router-prefetch": "1",
          cookie: "refreshToken=r1",
        },
      });
      const loginReq = new NextRequest("http://localhost:3001/login", {
        headers: {
          cookie: "refreshToken=r1",
        },
      });

      const refresh = () => {
        refreshCalls++;
        return Promise.resolve({ status: "invalid" as const });
      };

      await handleStorefrontProxy(prefetchReq, { refresh, isSecure: false });
      await handleStorefrontProxy(loginReq, { refresh, isSecure: false });

      expect(refreshCalls).toBe(0);
    });

    it("strips spoofed internal refresh and degraded headers on incoming requests", async () => {
      const req = new NextRequest("http://localhost:3001/", {
        headers: {
          [REFRESHED_ACCESS_TOKEN_HEADER]: "spoofed-token",
          [AUTH_DEGRADED_HEADER]: "1",
        },
      });

      const res = await handleStorefrontProxy(req, { isSecure: false });
      expect(
        res.headers.get(
          `x-middleware-request-${REFRESHED_ACCESS_TOKEN_HEADER}`,
        ),
      ).toBeNull();
      expect(
        res.headers.get(`x-middleware-request-${AUTH_DEGRADED_HEADER}`),
      ).toBeNull();
    });

    it("rotates missing or near-expired access token and forwards updated token to RSC", async () => {
      // Invariant: INV-SF-AUTH-5
      const req = new NextRequest("http://localhost:3001/orders", {
        headers: {
          cookie: `accessToken=${createJwtWithExp(nowSec + 20)}; refreshToken=r1`,
        },
      });

      const res = await handleStorefrontProxy(req, {
        isSecure: false,
        refresh: () =>
          Promise.resolve({
            status: "rotated",
            accessToken: "fresh-access-2",
            refreshToken: "fresh-refresh-2",
          }),
      });

      expect(res.status).toBe(200);
      expect(
        res.headers.get(
          `x-middleware-request-${REFRESHED_ACCESS_TOKEN_HEADER}`,
        ),
      ).toBe("fresh-access-2");
      const setCookies = res.headers.getSetCookie();
      expect(
        setCookies.some((c) => c.startsWith("accessToken=fresh-access-2")),
      ).toBe(true);
      expect(
        setCookies.some((c) => c.startsWith("refreshToken=fresh-refresh-2")),
      ).toBe(true);
    });

    it("redirects protected routes to /login and clears stale access token when refresh token is absent", async () => {
      // Invariant: INV-SF-AUTH-6
      const req = new NextRequest("http://localhost:3001/account/profile", {
        headers: {
          cookie: `accessToken=${createJwtWithExp(nowSec + 300)}`,
        },
      });

      const res = await handleStorefrontProxy(req, { isSecure: false });

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(
        "http://localhost:3001/login?redirect=%2Faccount%2Fprofile",
      );
      const setCookies = res.headers.getSetCookie();
      expect(
        setCookies.some(
          (c) => c.startsWith("accessToken=;") && c.includes("Max-Age=0"),
        ),
      ).toBe(true);
    });

    it("redirects protected routes to /login and clears cookies on invalid refresh", async () => {
      // Invariant: INV-SF-AUTH-6
      const req = new NextRequest(
        "http://localhost:3001/account/profile?tab=info",
        {
          headers: {
            cookie: "refreshToken=revoked-r1",
          },
        },
      );

      const res = await handleStorefrontProxy(req, {
        isSecure: false,
        refresh: () => Promise.resolve({ status: "invalid" }),
      });

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe(
        "http://localhost:3001/login?redirect=%2Faccount%2Fprofile%3Ftab%3Dinfo",
      );
      const setCookies = res.headers.getSetCookie();
      expect(
        setCookies.some(
          (c) => c.startsWith("accessToken=;") && c.includes("Max-Age=0"),
        ),
      ).toBe(true);
      expect(
        setCookies.some(
          (c) => c.startsWith("refreshToken=;") && c.includes("Max-Age=0"),
        ),
      ).toBe(true);
    });

    it("allows public routes as guest and clears cookies when refresh is invalid", async () => {
      const req = new NextRequest("http://localhost:3001/products", {
        headers: {
          cookie: "refreshToken=revoked-r1",
        },
      });

      const res = await handleStorefrontProxy(req, {
        isSecure: false,
        refresh: () => Promise.resolve({ status: "invalid" }),
      });

      expect(res.status).toBe(200);
      const setCookies = res.headers.getSetCookie();
      expect(
        setCookies.some(
          (c) => c.startsWith("refreshToken=;") && c.includes("Max-Age=0"),
        ),
      ).toBe(true);
    });

    it("preserves cookies on stale_concurrent and marks degraded header on protected transient_error", async () => {
      // Invariant: INV-SF-AUTH-3
      const req = new NextRequest("http://localhost:3001/orders", {
        headers: {
          cookie: "refreshToken=r1",
        },
      });

      const staleRes = await handleStorefrontProxy(req, {
        isSecure: false,
        refresh: () => Promise.resolve({ status: "stale_concurrent" }),
      });
      expect(staleRes.status).toBe(200);
      expect(staleRes.headers.getSetCookie()).toHaveLength(0);
      expect(staleRes.headers.get(AUTH_DEGRADED_HEADER)).toBeNull();

      const outageRes = await handleStorefrontProxy(req, {
        isSecure: false,
        refresh: () => Promise.resolve({ status: "transient_error" }),
      });
      expect(outageRes.status).toBe(200);
      expect(outageRes.headers.getSetCookie()).toHaveLength(0);
      expect(outageRes.headers.get(AUTH_DEGRADED_HEADER)).toBe("1");
    });

    it("excludes _next internals, favicon, apple-icon, and static extensions in route matcher", () => {
      const pattern = new RegExp(`^${config.matcher[0]}$`);
      expect(pattern.test("/")).toBe(true);
      expect(pattern.test("/orders/123")).toBe(true);
      expect(pattern.test("/_next/data/build-id/index.json")).toBe(false);
      expect(pattern.test("/_next/static/chunk.js")).toBe(false);
      expect(pattern.test("/favicon.ico")).toBe(false);
      expect(pattern.test("/apple-icon")).toBe(false);
      expect(pattern.test("/logo.svg")).toBe(false);
    });

    it("rewrites page requests to maintenance view and skips token refresh during maintenance mode", async () => {
      // Invariant: INV-SF-ERR-3
      let refreshCalls = 0;
      const req = new NextRequest("http://localhost:3001/orders/123", {
        headers: {
          cookie: "refreshToken=r1",
        },
      });

      const res = await handleStorefrontProxy(req, {
        isSecure: false,
        maintenanceMode: true,
        refresh: () => {
          refreshCalls++;
          return Promise.resolve({ status: "invalid" });
        },
      });

      expect(refreshCalls).toBe(0);
      expect(res.status).toBe(503);
      expect(res.headers.get("x-middleware-rewrite")).toBe(
        "http://localhost:3001/maintenance",
      );
      expect(res.headers.get("retry-after")).toBe("900");
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });

    it("returns maintenance problem response for api routes during maintenance mode", async () => {
      // Invariant: INV-SF-ERR-3
      const req = new NextRequest("http://localhost:3001/api/auth/logout", {
        method: "POST",
      });

      const res = await handleStorefrontProxy(req, {
        isSecure: false,
        maintenanceMode: true,
      });

      expect(res.status).toBe(503);
      expect(res.headers.get("content-type")).toContain(
        "application/problem+json",
      );
      expect(res.headers.get("retry-after")).toBe("900");
      const body = (await res.json()) as {
        status: number;
        code: string;
        type: string;
      };
      expect(body.status).toBe(503);
      expect(body.code).toBe("SERVICE_UNAVAILABLE");
      expect(body.type).toBe("/errors/service-unavailable");
    });
  });
});
