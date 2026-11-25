import { describe, expect, it } from "bun:test";
import type { CustomerAddress } from "@/types/address.types";
import type { StorefrontSessionUser } from "@/features/auth/types/auth.types";
import { actionRefreshedTokenStorage } from "@/features/auth/services/server-token";
import {
  resolveAccountAddressesSession,
  resolveAccountProfileSession,
  resolveHeaderAddresses,
  resolveServerSession,
  runWithServerActionRefresh,
} from "@/features/auth/services/session.server";

const sampleAddresses: CustomerAddress[] = [
  {
    id: "0195a8f0-0001-7000-8000-000000000001",
    receiverName: "Nguyễn Văn An",
    phoneNumber: "0901234567",
    streetAddress: "142 Lê Đức Thọ",
    districtCode: "go-vap",
    district: "Quận Gò Vấp",
    city: "TP. Hồ Chí Minh",
    isDefault: true,
    createdAt: "2026-11-20T00:00:00.000Z",
    updatedAt: "2026-11-20T00:00:00.000Z",
  },
];

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

  describe("resolveAccountProfileSession", () => {
    it("returns degraded immediately when proxy marks auth header degraded", async () => {
      // Invariant: INV-SF-PROFILE-1
      let fetchCalled = false;
      const resolution = await resolveAccountProfileSession({
        isDegraded: () => Promise.resolve(true),
        readToken: () => Promise.resolve("jwt-1"),
        fetchMe: () => {
          fetchCalled = true;
          return Promise.resolve({ data: { data: sampleUser } });
        },
      });

      expect(fetchCalled).toBe(false);
      expect(resolution).toEqual({ status: "degraded" });
    });

    it("returns unauthenticated when token is absent or profile fetch fails authentication", async () => {
      // Invariant: INV-SF-PROFILE-1
      const missingToken = await resolveAccountProfileSession({
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve(undefined),
      });
      const revokedToken = await resolveAccountProfileSession({
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve("revoked-jwt"),
        fetchMe: () =>
          Promise.resolve({
            response: { status: 401 },
            error: { status: 401 },
          }),
      });

      expect(missingToken).toEqual({ status: "unauthenticated" });
      expect(revokedToken).toEqual({ status: "unauthenticated" });
    });

    it("returns degraded when upstream profile endpoint hits server or network failure", async () => {
      // Invariant: INV-SF-PROFILE-1
      const upstreamError = await resolveAccountProfileSession({
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve("valid-jwt"),
        fetchMe: () =>
          Promise.resolve({
            response: { status: 503 },
            error: { status: 503 },
          }),
      });
      const networkError = await resolveAccountProfileSession({
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve("valid-jwt"),
        fetchMe: () => Promise.reject(new Error("ECONNREFUSED")),
      });

      expect(upstreamError).toEqual({ status: "degraded" });
      expect(networkError).toEqual({ status: "degraded" });
    });

    it("returns authenticated profile when token resolves live user data", async () => {
      // Invariant: INV-SF-PROFILE-1
      const resolution = await resolveAccountProfileSession({
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve("valid-jwt"),
        fetchMe: () =>
          Promise.resolve({
            response: { status: 200 },
            data: { data: sampleUser },
          }),
      });

      expect(resolution).toEqual({
        status: "authenticated",
        user: sampleUser,
      });
    });
  });

  describe("resolveHeaderAddresses", () => {
    it("skips upstream address requests for guests and fails open on upstream errors", async () => {
      let called = false;
      const guestResult = await resolveHeaderAddresses({
        readToken: () => Promise.resolve(undefined),
        fetchAddresses: () => {
          called = true;
          return Promise.resolve({ data: { data: sampleAddresses } });
        },
      });
      expect(called).toBe(false);
      expect(guestResult).toBeNull();

      const errorResult = await resolveHeaderAddresses({
        readToken: () => Promise.resolve("valid-jwt"),
        fetchAddresses: () =>
          Promise.resolve({
            response: { status: 503 },
            error: { status: 503 },
          }),
      });
      expect(errorResult).toBeNull();
    });
  });

  describe("resolveAccountAddressesSession", () => {
    // Invariant: INV-SF-ADDR-4
    it("separates proxy degraded and upstream errors from terminal unauthorized redirects", async () => {
      const degradedByHeader = await resolveAccountAddressesSession({
        isDegraded: () => Promise.resolve(true),
        readToken: () => Promise.resolve("valid-jwt"),
      });
      expect(degradedByHeader).toEqual({ status: "degraded" });

      const unauthenticatedByAddressEndpoint =
        await resolveAccountAddressesSession({
          isDegraded: () => Promise.resolve(false),
          readToken: () => Promise.resolve("valid-jwt"),
          fetchMe: () =>
            Promise.resolve({
              response: { status: 200 },
              data: { data: sampleUser },
            }),
          fetchAddresses: () =>
            Promise.resolve({
              response: { status: 401 },
              error: { status: 401 },
            }),
        });
      expect(unauthenticatedByAddressEndpoint).toEqual({
        status: "unauthenticated",
      });

      const degradedByAddressEndpoint = await resolveAccountAddressesSession({
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve("valid-jwt"),
        fetchMe: () =>
          Promise.resolve({
            response: { status: 200 },
            data: { data: sampleUser },
          }),
        fetchAddresses: () =>
          Promise.resolve({
            response: { status: 503 },
            error: { status: 503 },
          }),
      });
      expect(degradedByAddressEndpoint).toEqual({ status: "degraded" });
    });

    it("returns authenticated profile and addresses when both endpoints succeed", async () => {
      const authenticated = await resolveAccountAddressesSession({
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve("valid-jwt"),
        fetchMe: () =>
          Promise.resolve({
            response: { status: 200 },
            data: { data: sampleUser },
          }),
        fetchAddresses: () =>
          Promise.resolve({
            response: { status: 200 },
            data: { data: sampleAddresses },
          }),
      });

      expect(authenticated).toEqual({
        status: "authenticated",
        user: sampleUser,
        addresses: sampleAddresses,
      });
    });
  });
});
