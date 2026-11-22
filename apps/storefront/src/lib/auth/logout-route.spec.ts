import { describe, expect, it } from "bun:test";
import { handleLogoutPost } from "./logout-handler";

describe("Logout BFF Handler", () => {
  describe("handleLogoutPost", () => {
    it("rejects cross-origin POST requests before reading cookies or calling backend", async () => {
      // Invariant: INV-SF-AUTH-7
      let backendCalled = false;
      const req = new Request("http://localhost:3001/api/auth/logout", {
        method: "POST",
        headers: {
          origin: "https://attacker.example",
          host: "localhost:3001",
        },
      });

      const res = await handleLogoutPost(req, {
        allowedAppUrl: "http://localhost:3001",
        isSecure: false,
        readCookies: () =>
          Promise.resolve({ accessToken: "a1", refreshToken: "r1" }),
        backendFetch: () => {
          backendCalled = true;
          return Promise.resolve(new Response(null, { status: 200 }));
        },
      });

      expect(res.status).toBe(403);
      expect(res.headers.get("content-type")).toContain(
        "application/problem+json",
      );
      expect(backendCalled).toBe(false);
      const body = (await res.json()) as {
        code?: string;
        timestamp?: string;
      };
      expect(body.code).toBe("FORBIDDEN");
      expect(typeof body.timestamp).toBe("string");
    });

    it("forwards refreshToken and Bearer header to NestJS and clears both cookies", async () => {
      let capturedUrl = "";
      let capturedAuth = "";
      let capturedBody = "";

      const req = new Request("http://localhost:3001/api/auth/logout", {
        method: "POST",
        headers: {
          origin: "http://localhost:3001",
          host: "localhost:3001",
        },
      });

      const res = await handleLogoutPost(req, {
        allowedAppUrl: "http://localhost:3001",
        isSecure: false,
        readCookies: () =>
          Promise.resolve({
            accessToken: "jwt-access-1",
            refreshToken: "opaque-refresh-1",
          }),
        backendFetch: (url, init) => {
          capturedUrl =
            typeof url === "string"
              ? url
              : url instanceof URL
                ? url.href
                : url.url;
          const headers = new Headers(init?.headers);
          capturedAuth = headers.get("Authorization") ?? "";
          capturedBody = typeof init?.body === "string" ? init.body : "";
          return Promise.resolve(
            new Response(JSON.stringify({ success: true, data: null }), {
              status: 200,
            }),
          );
        },
      });

      expect(res.status).toBe(200);
      expect(capturedUrl).toContain("/api/v1/auth/logout");
      expect(capturedAuth).toBe("Bearer jwt-access-1");
      expect(JSON.parse(capturedBody)).toEqual({
        refreshToken: "opaque-refresh-1",
      });

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

    it("clears both cookies cleanly when backend revocation fails", async () => {
      const req = new Request("http://localhost:3001/api/auth/logout", {
        method: "POST",
        headers: {
          origin: "http://localhost:3001",
          host: "localhost:3001",
        },
      });

      const res = await handleLogoutPost(req, {
        allowedAppUrl: "http://localhost:3001",
        isSecure: false,
        readCookies: () =>
          Promise.resolve({
            accessToken: "expired",
            refreshToken: "revoked",
          }),
        backendFetch: () => Promise.reject(new Error("ECONNREFUSED")),
      });

      expect(res.status).toBe(200);
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
  });
});
