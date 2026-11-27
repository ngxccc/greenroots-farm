import { API_ERROR_CODES } from "@greenroots/shared";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { useAuthStore } from "@/features/auth/stores/auth.store";
import {
  api,
  resetAuthClientStateForTest,
  setUnauthorizedRedirectHandler,
} from "./api-client";

const originalFetch = globalThis.fetch;

describe("api-client", () => {
  describe("authSessionHandling", () => {
    beforeEach(() => {
      resetAuthClientStateForTest();
      useAuthStore.getState().setSession("expired-access", {
        id: "0195a8f0-0001-7000-8000-000000000011",
        fullName: "Admin",
        email: "admin@greenroots.vn",
        role: "admin",
      });
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      setUnauthorizedRedirectHandler(() => undefined);
    });

    it("coalesces concurrent expired-token responses into a single refresh and retries once", async () => {
      // Invariant: INV-4
      let refreshCalls = 0;
      let healthCalls = 0;

      globalThis.fetch = mock((input: RequestInfo | URL) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url.includes("/api/v1/auth/staff/refresh")) {
          refreshCalls += 1;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                success: true,
                data: {
                  accessToken: "fresh-access",
                  user: {
                    id: "0195a8f0-0001-7000-8000-000000000011",
                    fullName: "Admin",
                    email: "admin@greenroots.vn",
                    role: "admin",
                    status: "active",
                  },
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }

        healthCalls += 1;
        const authHeader =
          input instanceof Request ? input.headers.get("Authorization") : null;
        if (authHeader === "Bearer fresh-access") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                success: true,
                data: { status: "ok", message: "healthy" },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        }

        return Promise.resolve(
          new Response(
            JSON.stringify({
              code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          ),
        );
      }) as unknown as typeof fetch;

      const [res1, res2] = await Promise.all([
        api.GET("/api/v1/health"),
        api.GET("/api/v1/health"),
      ]);

      expect(refreshCalls).toBe(1);
      expect(healthCalls).toBe(4);
      expect(res1.response.status).toBe(200);
      expect(res2.response.status).toBe(200);
      expect(useAuthStore.getState().accessToken).toBe("fresh-access");
    });

    it("clears session and redirects when refresh fails on an unrecoverable unauthorized response", async () => {
      // Invariant: INV-4
      let redirectCount = 0;
      setUnauthorizedRedirectHandler(() => {
        redirectCount += 1;
      });

      globalThis.fetch = mock(() => {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          ),
        );
      }) as unknown as typeof fetch;

      const result = await api.GET("/api/v1/health");
      expect(result.response.status).toBe(401);
      expect(useAuthStore.getState().accessToken).toBeNull();
      expect(useAuthStore.getState().user).toBeNull();
      expect(redirectCount).toBe(1);
    });

    it("preserves session on RBAC denial and clears session with redirect on surface or suspended denial", async () => {
      // Invariant: INV-4
      let redirectCount = 0;
      setUnauthorizedRedirectHandler(() => {
        redirectCount += 1;
      });

      globalThis.fetch = mock(() => {
        return Promise.resolve(
          new Response(JSON.stringify({ code: API_ERROR_CODES.FORBIDDEN }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }) as unknown as typeof fetch;

      await api.GET("/api/v1/health");
      expect(useAuthStore.getState().accessToken).toBe("expired-access");
      expect(redirectCount).toBe(0);

      for (const code of [
        API_ERROR_CODES.AUTH_SURFACE_FORBIDDEN,
        API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED,
      ]) {
        useAuthStore.getState().setSession("active-access", {
          id: "0195a8f0-0001-7000-8000-000000000011",
          fullName: "Admin",
          email: "admin@greenroots.vn",
          role: "admin",
        });

        globalThis.fetch = mock(() => {
          return Promise.resolve(
            new Response(JSON.stringify({ code }), {
              status: 403,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }) as unknown as typeof fetch;

        await api.GET("/api/v1/health");
        expect(useAuthStore.getState().accessToken).toBeNull();
        expect(useAuthStore.getState().user).toBeNull();
      }

      expect(redirectCount).toBe(2);
    });

    it("skips refresh loop when staff login rejects invalid credentials", async () => {
      // Invariant: INV-4
      let refreshCalls = 0;
      let redirectCount = 0;
      setUnauthorizedRedirectHandler(() => {
        redirectCount += 1;
      });

      globalThis.fetch = mock((input: RequestInfo | URL) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url.includes("/api/v1/auth/staff/refresh")) {
          refreshCalls += 1;
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({ code: API_ERROR_CODES.AUTH_INVALID_CREDENTIALS }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          ),
        );
      }) as unknown as typeof fetch;

      const result = await api.POST("/api/v1/auth/staff/login", {
        body: { email: "staff@greenroots.vn", password: "wrong" },
      });

      expect(result.response.status).toBe(401);
      expect(refreshCalls).toBe(0);
      expect(redirectCount).toBe(0);
    });
  });
});
