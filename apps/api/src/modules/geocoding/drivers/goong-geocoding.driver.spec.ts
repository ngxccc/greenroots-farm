import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { BUSINESS_RULES } from "@greenroots/shared";
import { env, parseApiEnvironment } from "@/common/config/env.config";
import {
  GoongGeocodingDriver,
  redactGoongSecrets,
} from "./goong-geocoding.driver";

describe("GoongGeocodingDriver", () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = env.GOONG_API_KEY;

  beforeEach(() => {
    (env as { GOONG_API_KEY?: string }).GOONG_API_KEY = "secret-goong-key-123";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (env as { GOONG_API_KEY?: string }).GOONG_API_KEY = originalApiKey;
  });

  describe("redactGoongSecrets", () => {
    // Invariant: INV-GEO-2
    it("strips api_key query parameters and raw key values from error strings", () => {
      const raw =
        "Request to https://rsapi.goong.io/Place/Detail?api_key=secret-goong-key-123&place_id=p1 failed: secret-goong-key-123";
      const redacted = redactGoongSecrets(raw, "secret-goong-key-123");

      expect(redacted).not.toContain("secret-goong-key-123");
      expect(redacted).toContain("api_key=[REDACTED]");
    });
  });

  describe("resolvePlace", () => {
    it("parses geometry coordinates and falls back district to DEFAULT_DELIVERY_CITY when omitted", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              status: "OK",
              result: {
                place_id: "goong-p1",
                formatted_address: "Khu công nghệ cao, TP. Hồ Chí Minh",
                geometry: { location: { lat: 10.8428, lng: 106.8099 } },
              },
            }),
            { status: 200 },
          ),
        ),
      ) as unknown as typeof fetch;

      const driver = new GoongGeocodingDriver();
      const resolved = await driver.resolvePlace("goong-p1");

      expect(resolved).toEqual({
        placeId: "goong-p1",
        latitude: 10.8428,
        longitude: 106.8099,
        district: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
        formattedAddress: "Khu công nghệ cao, TP. Hồ Chí Minh",
      });
    });

    it("returns null when Goong reports a missing place status", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ status: "NOT_FOUND" }), {
            status: 200,
          }),
        ),
      ) as unknown as typeof fetch;

      const driver = new GoongGeocodingDriver();
      const resolved = await driver.resolvePlace("missing-place");
      expect(resolved).toBeNull();
    });

    // Invariant: INV-GEO-2
    it("redacts GOONG_API_KEY when fetch throws an error containing the key", async () => {
      globalThis.fetch = mock(() =>
        Promise.reject(
          new Error(
            "fetch failed for https://rsapi.goong.io/Place/Detail?api_key=secret-goong-key-123",
          ),
        ),
      ) as unknown as typeof fetch;

      const driver = new GoongGeocodingDriver();
      try {
        await driver.resolvePlace("p1");
        expect.unreachable("Expected error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("api_key=[REDACTED]");
        expect((error as Error).message).not.toContain("secret-goong-key-123");
      }
    });
  });

  describe("production env fail-fast", () => {
    // Invariant: INV-GEO-2
    it("throws when NODE_ENV is production and GEOCODING_DRIVER is goong without GOONG_API_KEY", () => {
      expect(() =>
        parseApiEnvironment({
          NODE_ENV: "production",
          JWT_ACCESS_SECRET: "a".repeat(32),
          CLOUDINARY_CLOUD_NAME: "cloud",
          CLOUDINARY_API_KEY: "key",
          CLOUDINARY_API_SECRET: "secret",
          STOREFRONT_URL: "https://greenroots.farm",
          GEOCODING_DRIVER: "goong",
        }),
      ).toThrow("GOONG_API_KEY");
    });
  });
});
