import { describe, expect, it } from "bun:test";
import {
  API_ERROR_CODES,
  resolveSharedApiErrorMessage,
} from "@greenroots/shared";
import type { CustomerAddress } from "@/features/account/types/address.types";
import type {
  CustomerActiveSession,
  StorefrontSessionUser,
} from "@/features/auth/types/auth.types";
import { actionRefreshedTokenStorage } from "@/features/auth/services/server-token";
import {
  resolveAccountAddressesSession,
  resolveAccountProfileSession,
  resolveAccountProfileWithSessions,
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
    placeId: "mock_place_go_vap",
    ward: "Phường Gò Vấp",
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

const sampleActiveSessions: CustomerActiveSession[] = [
  {
    id: "0195a8f0-0001-7000-8000-000000000101",
    deviceName:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
    ipAddress: "203.0.113.42",
    createdAt: "2026-11-20T04:15:00.000Z",
    expiresAt: "2026-11-27T04:15:00.000Z",
    isCurrent: true,
  },
  {
    id: "0195a8f0-0001-7000-8000-000000000102",
    deviceName: null,
    ipAddress: null,
    createdAt: "2026-11-19T08:00:00.000Z",
    expiresAt: "2026-11-26T08:00:00.000Z",
    isCurrent: false,
  },
];

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

    it("returns null when upstream profile call rejects, returns an error, or returns a non-customer role", async () => {
      const errored = await resolveServerSession({
        readToken: () => Promise.resolve("revoked-jwt"),
        fetchMe: () => Promise.resolve({ error: { status: 401 } }),
      });
      const thrown = await resolveServerSession({
        readToken: () => Promise.resolve("jwt"),
        fetchMe: () => Promise.reject(new Error("ECONNREFUSED")),
      });
      const staffRole = await resolveServerSession({
        readToken: () => Promise.resolve("staff-jwt"),
        fetchMe: () =>
          Promise.resolve({ data: { data: { ...sampleUser, role: "sales" } } }),
      });

      expect(errored).toBeNull();
      expect(thrown).toBeNull();
      expect(staffRole).toBeNull();
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

    it("forwards Server Action client headers into refreshSingleFlight on 401 retry", async () => {
      // Invariant: INV-SF-AUTH-10
      let capturedHeaders: Record<string, string> | undefined;
      let attempts = 0;

      const result = await runWithServerActionRefresh(
        () => {
          attempts++;
          return Promise.resolve({
            response: new Response(null, {
              status: attempts === 1 ? 401 : 200,
            }),
          });
        },
        {
          readRefreshToken: () => Promise.resolve("r1"),
          readClientHeaders: () =>
            Promise.resolve({
              "User-Agent": "ActionBrowser/1.0",
              "X-BFF-Client-IP": "203.0.113.55",
            }),
          refresh: (_token, options) => {
            capturedHeaders = options?.clientHeaders;
            return Promise.resolve({
              status: "rotated",
              accessToken: "a2",
              refreshToken: "r2",
            });
          },
          applyTokens: () => Promise.resolve(),
        },
      );

      expect(result.refreshOutcome).toBe("rotated");
      expect(capturedHeaders).toEqual({
        "User-Agent": "ActionBrowser/1.0",
        "X-BFF-Client-IP": "203.0.113.55",
      });
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

    it("returns unauthenticated for account profile and address resolvers when role is non-customer", async () => {
      const profileResult = await resolveAccountProfileSession({
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve("staff-jwt"),
        fetchMe: () =>
          Promise.resolve({
            response: { status: 200 },
            data: { data: { ...sampleUser, role: "admin" } },
          }),
      });
      const addressesResult = await resolveAccountAddressesSession({
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve("staff-jwt"),
        fetchMe: () =>
          Promise.resolve({
            response: { status: 200 },
            data: { data: { ...sampleUser, role: "admin" } },
          }),
        fetchAddresses: () =>
          Promise.resolve({
            response: { status: 200 },
            data: { data: sampleAddresses },
          }),
      });

      expect(profileResult).toEqual({ status: "unauthenticated" });
      expect(addressesResult).toEqual({ status: "unauthenticated" });
    });
  });

  describe("resolveAccountProfileWithSessions", () => {
    it("returns degraded immediately when proxy marks auth header degraded", async () => {
      // Invariant: INV-SF-PROFILE-1
      let called = false;
      const resolution = await resolveAccountProfileWithSessions({
        isDegraded: () => Promise.resolve(true),
        readToken: () => Promise.resolve("valid-jwt"),
        fetchMe: () => {
          called = true;
          return Promise.resolve({ data: { data: sampleUser } });
        },
        fetchCustomerSessions: () => {
          called = true;
          return Promise.resolve({ data: { data: sampleActiveSessions } });
        },
      });

      expect(called).toBe(false);
      expect(resolution).toEqual({ status: "degraded" });
    });

    it("returns unauthenticated when token is absent, role is non-customer, or either endpoint fails authentication", async () => {
      // Invariant: INV-SF-PROFILE-1
      const missingToken = await resolveAccountProfileWithSessions({
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve(undefined),
      });
      const unauthorizedSessions = await resolveAccountProfileWithSessions({
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve("valid-jwt"),
        fetchMe: () =>
          Promise.resolve({
            response: { status: 200 },
            data: { data: sampleUser },
          }),
        fetchCustomerSessions: () =>
          Promise.resolve({
            response: { status: 401 },
            error: { status: 401 },
          }),
      });
      const staffRole = await resolveAccountProfileWithSessions({
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve("staff-jwt"),
        fetchMe: () =>
          Promise.resolve({
            response: { status: 200 },
            data: { data: { ...sampleUser, role: "admin" } },
          }),
        fetchCustomerSessions: () =>
          Promise.resolve({
            response: { status: 200 },
            data: { data: [] },
          }),
      });

      expect(missingToken).toEqual({ status: "unauthenticated" });
      expect(unauthorizedSessions).toEqual({ status: "unauthenticated" });
      expect(staffRole).toEqual({ status: "unauthenticated" });
    });

    it("returns authenticated profile with active sessions when both endpoints succeed", async () => {
      const populated = await resolveAccountProfileWithSessions({
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve("valid-jwt"),
        fetchMe: () =>
          Promise.resolve({
            response: { status: 200 },
            data: { data: sampleUser },
          }),
        fetchCustomerSessions: () =>
          Promise.resolve({
            response: { status: 200 },
            data: { data: sampleActiveSessions },
          }),
      });

      expect(populated).toEqual({
        status: "authenticated",
        user: sampleUser,
        sessionsState: {
          status: "loaded",
          sessions: sampleActiveSessions,
        },
      });

      const empty = await resolveAccountProfileWithSessions({
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve("valid-jwt"),
        fetchMe: () =>
          Promise.resolve({
            response: { status: 200 },
            data: { data: sampleUser },
          }),
        fetchCustomerSessions: () =>
          Promise.resolve({
            response: { status: 200 },
            data: { data: [] },
          }),
      });

      expect(empty).toEqual({
        status: "authenticated",
        user: sampleUser,
        sessionsState: {
          status: "loaded",
          sessions: [],
        },
      });
    });

    it("preserves authenticated profile with degraded sessions state when sessions endpoint fails transiently", async () => {
      const upstreamUnavailable = await resolveAccountProfileWithSessions({
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve("valid-jwt"),
        fetchMe: () =>
          Promise.resolve({
            response: { status: 200 },
            data: { data: sampleUser },
          }),
        fetchCustomerSessions: () =>
          Promise.resolve({
            response: { status: 503 },
            error: { status: 503 },
          }),
      });

      expect(upstreamUnavailable).toEqual({
        status: "authenticated",
        user: sampleUser,
        sessionsState: {
          status: "degraded",
          errorMessage: resolveSharedApiErrorMessage(
            API_ERROR_CODES.SERVICE_UNAVAILABLE,
          ),
        },
      });

      const rateLimited = await resolveAccountProfileWithSessions({
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve("valid-jwt"),
        fetchMe: () =>
          Promise.resolve({
            response: { status: 200 },
            data: { data: sampleUser },
          }),
        fetchCustomerSessions: () =>
          Promise.resolve({
            response: { status: 429 },
            error: { status: 429 },
          }),
      });

      expect(rateLimited).toEqual({
        status: "authenticated",
        user: sampleUser,
        sessionsState: {
          status: "degraded",
          errorMessage: resolveSharedApiErrorMessage(
            API_ERROR_CODES.TOO_MANY_REQUESTS,
          ),
        },
      });

      const networkRejected = await resolveAccountProfileWithSessions({
        isDegraded: () => Promise.resolve(false),
        readToken: () => Promise.resolve("valid-jwt"),
        fetchMe: () =>
          Promise.resolve({
            response: { status: 200 },
            data: { data: sampleUser },
          }),
        fetchCustomerSessions: () =>
          Promise.reject(new Error("ECONNREFUSED secret-token-value")),
      });

      expect(networkRejected.status).toBe("authenticated");
      if (networkRejected.status === "authenticated") {
        expect(networkRejected.sessionsState.status).toBe("degraded");
        if (networkRejected.sessionsState.status === "degraded") {
          expect(networkRejected.sessionsState.errorMessage).not.toContain(
            "ECONNREFUSED",
          );
          expect(networkRejected.sessionsState.errorMessage).not.toContain(
            "secret-token-value",
          );
        }
      }
    });
  });
});
