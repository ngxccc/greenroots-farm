import { describe, expect, it } from "bun:test";
import { API_ERROR_CODES } from "@greenroots/shared";
import { handleShippingQuotePost } from "./shipping-quote-handler";

const SAMPLE_QUOTE = {
  straightLineKm: 11.2,
  roadDistanceKm: 14.6,
  feeVnd: 25_000,
  isDeliverable: true,
  isFreeShipping: false,
  maxRadiusKm: 25,
  subscriptionFreeRadiusKm: 20,
};

function makeQuoteRequest(
  body: unknown,
  origin = "http://localhost:3001",
): Request {
  return new Request("http://localhost:3001/api/shipping/quote", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      host: "localhost:3001",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("ShippingQuoteHandler", () => {
  describe("handleShippingQuotePost", () => {
    it("rejects cross-origin requests before reading cookies or calling backend", async () => {
      // Invariant: INV-SF-AUTH-7
      let backendCalled = false;
      const req = makeQuoteRequest(
        { districtCode: "QUAN_1" },
        "https://attacker.example",
      );

      const res = await handleShippingQuotePost(req, {
        allowedAppUrl: "http://localhost:3001",
        isSecure: false,
        readTokens: () => Promise.resolve({ accessToken: "token" }),
        postQuote: () => {
          backendCalled = true;
          return Promise.resolve({
            response: new Response(null, { status: 200 }),
            data: { data: SAMPLE_QUOTE },
          });
        },
      });

      expect(res.status).toBe(403);
      expect(res.headers.get("content-type")).toContain(
        "application/problem+json",
      );
      expect(backendCalled).toBe(false);
    });

    it("rejects payloads providing both addressId and districtCode", async () => {
      let backendCalled = false;
      const req = makeQuoteRequest({
        addressId: "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9f",
        districtCode: "QUAN_1",
      });

      const res = await handleShippingQuotePost(req, {
        allowedAppUrl: "http://localhost:3001",
        isSecure: false,
        readTokens: () => Promise.resolve({ accessToken: "token" }),
        postQuote: () => {
          backendCalled = true;
          return Promise.resolve({
            response: new Response(null, { status: 200 }),
            data: { data: SAMPLE_QUOTE },
          });
        },
      });

      expect(res.status).toBe(400);
      expect(backendCalled).toBe(false);
      const body = (await res.json()) as { code?: string };
      expect(body.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
    });

    it("rejects non-UUIDv7 addressId payloads", async () => {
      let backendCalled = false;
      const req = makeQuoteRequest({
        addressId: "550e8400-e29b-41d4-a716-446655440000",
      });

      const res = await handleShippingQuotePost(req, {
        allowedAppUrl: "http://localhost:3001",
        isSecure: false,
        readTokens: () => Promise.resolve({ accessToken: "token" }),
        postQuote: () => {
          backendCalled = true;
          return Promise.resolve({
            response: new Response(null, { status: 200 }),
            data: { data: SAMPLE_QUOTE },
          });
        },
      });

      expect(res.status).toBe(400);
      expect(backendCalled).toBe(false);
    });

    it("rejects unauthenticated requests when both access and refresh cookies are missing", async () => {
      let backendCalled = false;
      const req = makeQuoteRequest({ districtCode: "QUAN_1" });

      const res = await handleShippingQuotePost(req, {
        allowedAppUrl: "http://localhost:3001",
        isSecure: false,
        readTokens: () => Promise.resolve({}),
        postQuote: () => {
          backendCalled = true;
          return Promise.resolve({
            response: new Response(null, { status: 200 }),
            data: { data: SAMPLE_QUOTE },
          });
        },
      });

      expect(res.status).toBe(401);
      expect(backendCalled).toBe(false);
      const body = (await res.json()) as {
        code?: string;
        sessionInvalidated?: boolean;
      };
      expect(body.code).toBe(API_ERROR_CODES.UNAUTHORIZED);
      expect(body.sessionInvalidated).toBe(true);
    });

    it("rotates session via refresh flow when access cookie is missing but refresh cookie exists", async () => {
      // Invariant: ADR-0036
      const req = makeQuoteRequest({ districtCode: "QUAN_1" });

      const res = await handleShippingQuotePost(req, {
        allowedAppUrl: "http://localhost:3001",
        isSecure: false,
        readTokens: () => Promise.resolve({ refreshToken: "refresh-7d" }),
        postQuote: () =>
          Promise.resolve({
            response: new Response(null, { status: 200 }),
            data: { data: SAMPLE_QUOTE },
          }),
        runWithRefresh: async (op) => ({
          ...(await op()),
          refreshOutcome: "rotated",
          rotatedAccessToken: "new-access",
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        success?: boolean;
        data?: typeof SAMPLE_QUOTE;
      };
      expect(body.success).toBe(true);
      expect(body.data).toEqual(SAMPLE_QUOTE);
    });

    it("forwards valid districtCode requests and returns server quote payload", async () => {
      let capturedBody: unknown = null;
      const req = makeQuoteRequest({
        districtCode: "QUAN_1",
        isSubscription: false,
      });

      const res = await handleShippingQuotePost(req, {
        allowedAppUrl: "http://localhost:3001",
        isSecure: false,
        readTokens: () => Promise.resolve({ accessToken: "access-123" }),
        postQuote: (body) => {
          capturedBody = body;
          return Promise.resolve({
            response: new Response(null, { status: 200 }),
            data: { data: SAMPLE_QUOTE },
          });
        },
        runWithRefresh: async (op) => ({
          ...(await op()),
          refreshOutcome: "not_needed",
        }),
      });

      expect(res.status).toBe(200);
      expect(capturedBody).toEqual({
        districtCode: "QUAN_1",
        isSubscription: false,
      });
    });

    it("forwards valid addressId requests including undeliverable quotes", async () => {
      const outOfRadiusQuote = {
        ...SAMPLE_QUOTE,
        roadDistanceKm: 28.4,
        feeVnd: null,
        isDeliverable: false,
        maxRadiusKm: 25,
      };
      const req = makeQuoteRequest({
        addressId: "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9f",
      });

      const res = await handleShippingQuotePost(req, {
        allowedAppUrl: "http://localhost:3001",
        isSecure: false,
        readTokens: () => Promise.resolve({ accessToken: "access-123" }),
        postQuote: () =>
          Promise.resolve({
            response: new Response(null, { status: 200 }),
            data: { data: outOfRadiusQuote },
          }),
        runWithRefresh: async (op) => ({
          ...(await op()),
          refreshOutcome: "not_needed",
        }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { data?: typeof outOfRadiusQuote };
      expect(body.data?.isDeliverable).toBe(false);
      expect(body.data?.feeVnd).toBeNull();
      expect(body.data?.maxRadiusKm).toBe(25);
    });

    it("preserves session and returns fallback error when refresh fails transiently", async () => {
      // Invariant: ADR-0036
      const req = makeQuoteRequest({ districtCode: "QUAN_1" });

      const res = await handleShippingQuotePost(req, {
        allowedAppUrl: "http://localhost:3001",
        isSecure: false,
        readTokens: () =>
          Promise.resolve({
            accessToken: "expired-access",
            refreshToken: "valid-refresh",
          }),
        postQuote: () =>
          Promise.resolve({
            response: new Response(null, { status: 401 }),
          }),
        runWithRefresh: async (op) => ({
          ...(await op()),
          refreshOutcome: "transient_error",
        }),
      });

      expect(res.status).toBe(503);
      const body = (await res.json()) as {
        code?: string;
        sessionInvalidated?: boolean;
      };
      expect(body.code).toBe(API_ERROR_CODES.SERVICE_UNAVAILABLE);
      expect(body.sessionInvalidated).toBeUndefined();
      expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("marks session invalidated and clears cookies when refresh fails permanently", async () => {
      const req = makeQuoteRequest({ districtCode: "QUAN_1" });

      const res = await handleShippingQuotePost(req, {
        allowedAppUrl: "http://localhost:3001",
        isSecure: false,
        readTokens: () =>
          Promise.resolve({
            accessToken: "expired-access",
            refreshToken: "revoked-refresh",
          }),
        postQuote: () =>
          Promise.resolve({
            response: new Response(null, { status: 401 }),
            error: {
              type: "/errors/unauthorized",
              title: "Unauthorized",
              status: 401,
              code: API_ERROR_CODES.UNAUTHORIZED,
              detail: "Token expired",
            },
          }),
        runWithRefresh: async (op) => ({
          ...(await op()),
          refreshOutcome: "invalid",
        }),
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as { sessionInvalidated?: boolean };
      expect(body.sessionInvalidated).toBe(true);
      expect(res.headers.get("set-cookie")).toContain("accessToken=;");
    });

    it("returns degraded problem envelope when backend request throws", async () => {
      const req = makeQuoteRequest({ districtCode: "QUAN_1" });

      const res = await handleShippingQuotePost(req, {
        allowedAppUrl: "http://localhost:3001",
        isSecure: false,
        readTokens: () => Promise.resolve({ accessToken: "access-123" }),
        postQuote: () => Promise.reject(new Error("ECONNREFUSED")),
        runWithRefresh: async (op) => ({
          ...(await op()),
          refreshOutcome: "not_needed",
        }),
      });

      expect(res.status).toBe(503);
      const body = (await res.json()) as { code?: string };
      expect(body.code).toBe(API_ERROR_CODES.SERVICE_UNAVAILABLE);
    });
  });
});
