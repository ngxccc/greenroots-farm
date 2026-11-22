import { describe, expect, it } from "bun:test";
import type { StorefrontSessionUser } from "@/types/auth.types";
import { actionRefreshedTokenStorage } from "./server-token";
import {
  resolveServerSession,
  runWithServerActionRefresh,
} from "./session.server";

const sampleUser: StorefrontSessionUser = {
  id: "0195a8f0-0001-7000-8000-000000000099",
  email: "khach@greenroots.vn",
  fullName: "Nguyễn Văn An",
  phone: "0901234567",
  role: "customer",
  status: "active",
  rewardPoints: 12500,
  emailVerified: true,
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
};

describe("Server Auth Session", () => {
  describe("resolveServerSession", () => {
    it("skips upstream profile calls when no access token is present", async () => {
      let called = false;
      const user = await resolveServerSession({
        readToken: () => Promise.resolve(undefined),
        fetchMe: () => {
          called = true;
          return Promise.resolve({ data: { data: sampleUser } });
        },
      });

      expect(called).toBe(false);
      expect(user).toBeNull();
    });

    it("returns customer profile when access token resolves valid identity", async () => {
      const user = await resolveServerSession({
        readToken: () => Promise.resolve("valid-jwt"),
        fetchMe: () => Promise.resolve({ data: { data: sampleUser } }),
      });

      expect(user).toEqual(sampleUser);
    });

    it("returns null when upstream profile call rejects or returns an error", async () => {
      const errored = await resolveServerSession({
        readToken: () => Promise.resolve("revoked-jwt"),
        fetchMe: () => Promise.resolve({ error: { status: 401 } }),
      });
      const thrown = await resolveServerSession({
        readToken: () => Promise.resolve("jwt"),
        fetchMe: () => Promise.reject(new Error("ECONNREFUSED")),
      });

      expect(errored).toBeNull();
      expect(thrown).toBeNull();
    });
  });

  describe("runWithServerActionRefresh", () => {
    it("retries operation once with rotated token scoped to AsyncLocalStorage when initial call fails", async () => {
      // Invariant: INV-SF-AUTH-4
      let attempts = 0;
      const appliedPairs: { accessToken: string; refreshToken: string }[] = [];
      let retryTokenInsideStore: string | undefined;

      const result = await runWithServerActionRefresh(
        () => {
          attempts++;
          if (attempts === 1) {
            return Promise.resolve({
              response: new Response(null, { status: 401 }),
            });
          }
          retryTokenInsideStore = actionRefreshedTokenStorage.getStore();
          return Promise.resolve({
            response: new Response(null, { status: 200 }),
            data: { ok: true },
          });
        },
        {
          readRefreshToken: () => Promise.resolve("r1"),
          refresh: () =>
            Promise.resolve({
              status: "rotated",
              accessToken: "a2",
              refreshToken: "r2",
            }),
          applyTokens: (tokens) => {
            appliedPairs.push(tokens);
            return Promise.resolve();
          },
          clearTokens: () =>
            Promise.reject(new Error("must not clear on rotation")),
        },
      );

      expect(attempts).toBe(2);
      expect(appliedPairs).toEqual([{ accessToken: "a2", refreshToken: "r2" }]);
      expect(retryTokenInsideStore).toBe("a2");
      expect(result.response.status).toBe(200);
      expect(result.data).toEqual({ ok: true });
    });

    it("clears cookies without retrying when refresh returns invalid", async () => {
      // Invariant: INV-SF-AUTH-4
      let attempts = 0;
      let cleared = false;

      const result = await runWithServerActionRefresh(
        () => {
          attempts++;
          return Promise.resolve({
            response: new Response(null, { status: 401 }),
          });
        },
        {
          readRefreshToken: () => Promise.resolve("revoked"),
          refresh: () => Promise.resolve({ status: "invalid" }),
          applyTokens: () =>
            Promise.reject(new Error("must not apply on invalid")),
          clearTokens: () => {
            cleared = true;
            return Promise.resolve();
          },
        },
      );

      expect(attempts).toBe(1);
      expect(cleared).toBe(true);
      expect(result.response.status).toBe(401);
    });

    it("preserves cookies and returns initial response when refresh hits transient error", async () => {
      let cleared = false;

      const result = await runWithServerActionRefresh(
        () =>
          Promise.resolve({
            response: new Response(null, { status: 401 }),
          }),
        {
          readRefreshToken: () => Promise.resolve("r1"),
          refresh: () => Promise.resolve({ status: "transient_error" }),
          clearTokens: () => {
            cleared = true;
            return Promise.resolve();
          },
        },
      );

      expect(cleared).toBe(false);
      expect(result.response.status).toBe(401);
    });
  });
});
