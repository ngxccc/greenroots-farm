import { afterEach, describe, expect, it } from "bun:test";
import {
  buildShippingQuoteCacheKey,
  clearShippingQuoteCache,
  fetchShippingQuoteFromBff,
} from "./use-shipping-quote";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearShippingQuoteCache();
});

describe("ShippingQuoteClient", () => {
  describe("buildShippingQuoteCacheKey", () => {
    it("separates addressId and districtCode keys with subscription flag", () => {
      expect(
        buildShippingQuoteCacheKey({
          addressId: "addr-1",
          isSubscription: false,
        }),
      ).toBe("addr:addr-1:sub:false");

      expect(
        buildShippingQuoteCacheKey({
          districtCode: "QUAN_1",
          isSubscription: true,
        }),
      ).toBe("dist:QUAN_1:sub:true");
    });
  });

  describe("fetchShippingQuoteFromBff", () => {
    it("returns parsed quote when BFF responds with success envelope", async () => {
      const sampleQuote = {
        straightLineKm: 10.5,
        roadDistanceKm: 13.7,
        feeVnd: 0,
        isDeliverable: true,
        isFreeShipping: true,
        maxRadiusKm: 25,
        subscriptionFreeRadiusKm: 20,
      };

      globalThis.fetch = (() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true, data: sampleQuote }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        )) as unknown as typeof fetch;

      const result = await fetchShippingQuoteFromBff({
        districtCode: "QUAN_1",
        isSubscription: true,
      });

      expect(result).toEqual({ ok: true, quote: sampleQuote });
    });

    it("flags session invalidation when BFF rejects authentication", async () => {
      globalThis.fetch = (() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              message: "Phiên đăng nhập đã hết hạn.",
              sessionInvalidated: true,
            }),
            {
              status: 401,
              headers: { "content-type": "application/problem+json" },
            },
          ),
        )) as unknown as typeof fetch;

      const result = await fetchShippingQuoteFromBff({
        addressId: "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9f",
        isSubscription: false,
      });

      expect(result).toEqual({
        ok: false,
        message: "Phiên đăng nhập đã hết hạn.",
        sessionInvalidated: true,
      });
    });

    it("preserves session when BFF returns recoverable error without invalidation flag", async () => {
      globalThis.fetch = (() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              message: "Không thể làm mới phiên đăng nhập lúc này.",
              sessionInvalidated: false,
            }),
            {
              status: 401,
              headers: { "content-type": "application/problem+json" },
            },
          ),
        )) as unknown as typeof fetch;

      const result = await fetchShippingQuoteFromBff({
        districtCode: "QUAN_1",
        isSubscription: false,
      });

      expect(result).toEqual({
        ok: false,
        message: "Không thể làm mới phiên đăng nhập lúc này.",
        sessionInvalidated: false,
      });
    });
  });
});
