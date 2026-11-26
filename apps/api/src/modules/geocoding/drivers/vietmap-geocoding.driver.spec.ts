import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { BUSINESS_RULES } from "@greenroots/shared";
import { env, parseApiEnvironment } from "@/common/config/env.config";
import {
  VietmapGeocodingDriver,
  redactVietmapSecrets,
} from "./vietmap-geocoding.driver";

describe("VietmapGeocodingDriver", () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = env.VIETMAP_API_KEY;

  beforeEach(() => {
    (env as { VIETMAP_API_KEY?: string }).VIETMAP_API_KEY =
      "secret-vietmap-key-123";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (env as { VIETMAP_API_KEY?: string }).VIETMAP_API_KEY = originalApiKey;
  });

  describe("redactVietmapSecrets", () => {
    // Invariant: INV-GEO-2
    it("strips apikey query parameters and raw key values from error strings", () => {
      const raw =
        "Request to https://maps.vietmap.vn/api/place/v4?apikey=secret-vietmap-key-123&refid=auto:1 failed: secret-vietmap-key-123";
      const redacted = redactVietmapSecrets(raw, "secret-vietmap-key-123");

      expect(redacted).not.toContain("secret-vietmap-key-123");
      expect(redacted).toContain("apikey=[REDACTED]");
    });
  });

  describe("autocomplete", () => {
    it("maps Vietmap v4 2-level autocomplete array into PlaceSuggestion items with ward", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify([
              {
                ref_id: "auto:abc123",
                address: "Phường Chợ Quán, Thành Phố Hồ Chí Minh",
                name: "197 Trần Phú",
                display: "197 Trần Phú, Phường Chợ Quán, Thành Phố Hồ Chí Minh",
                boundaries: [
                  {
                    type: 2,
                    name: "Chợ Quán",
                    full_name: "Phường Chợ Quán",
                  },
                  {
                    type: 0,
                    name: "Hồ Chí Minh",
                    full_name: "Thành Phố Hồ Chí Minh",
                  },
                ],
              },
            ]),
            { status: 200 },
          ),
        ),
      ) as unknown as typeof fetch;

      const driver = new VietmapGeocodingDriver();
      const results = await driver.autocomplete("197 tran phu");

      expect(results).toEqual([
        {
          placeId: "auto:abc123",
          description: "197 Trần Phú, Phường Chợ Quán, Thành Phố Hồ Chí Minh",
          ward: "Phường Chợ Quán",
          streetName: "197 Trần Phú",
        },
      ]);
    });
  });

  describe("resolvePlace", () => {
    it("parses lat/lng and ward from Vietmap v4 2-level response", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              display:
                "197 Đường Trần Phú, Phường Chợ Quán, Thành Phố Hồ Chí Minh",
              ward: "Phường Chợ Quán",
              district: "",
              city: "Thành Phố Hồ Chí Minh",
              lat: 10.7592229,
              lng: 106.6759027,
            }),
            { status: 200 },
          ),
        ),
      ) as unknown as typeof fetch;

      const driver = new VietmapGeocodingDriver();
      const resolved = await driver.resolvePlace("auto:abc123");

      expect(resolved).toEqual({
        placeId: "auto:abc123",
        latitude: 10.7592229,
        longitude: 106.6759027,
        ward: "Phường Chợ Quán",
        formattedAddress:
          "197 Đường Trần Phú, Phường Chợ Quán, Thành Phố Hồ Chí Minh",
      });
    });

    it("falls back ward to DEFAULT_DELIVERY_CITY when all administrative fields are missing", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              lat: 10.8428,
              lng: 106.8099,
            }),
            { status: 200 },
          ),
        ),
      ) as unknown as typeof fetch;

      const driver = new VietmapGeocodingDriver();
      const resolved = await driver.resolvePlace("auto:khu-cnc");

      expect(resolved?.ward).toBe(BUSINESS_RULES.DEFAULT_DELIVERY_CITY);
    });

    it("returns null when Vietmap reports a missing place", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(null, { status: 404 })),
      ) as unknown as typeof fetch;

      const driver = new VietmapGeocodingDriver();
      const resolved = await driver.resolvePlace("auto:missing");
      expect(resolved).toBeNull();
    });

    // Invariant: INV-GEO-2
    it("redacts VIETMAP_API_KEY when fetch throws an error containing the key", async () => {
      globalThis.fetch = mock(() =>
        Promise.reject(
          new Error(
            "fetch failed for https://maps.vietmap.vn/api/place/v4?apikey=secret-vietmap-key-123",
          ),
        ),
      ) as unknown as typeof fetch;

      const driver = new VietmapGeocodingDriver();
      try {
        await driver.resolvePlace("auto:1");
        expect.unreachable("Expected error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("apikey=[REDACTED]");
        expect((error as Error).message).not.toContain(
          "secret-vietmap-key-123",
        );
      }
    });
  });

  describe("production env fail-fast", () => {
    // Invariant: INV-GEO-2
    it("throws when NODE_ENV is production and GEOCODING_DRIVER is vietmap without VIETMAP_API_KEY", () => {
      expect(() =>
        parseApiEnvironment({
          NODE_ENV: "production",
          JWT_ACCESS_SECRET: "a".repeat(32),
          CLOUDINARY_CLOUD_NAME: "cloud",
          CLOUDINARY_API_KEY: "key",
          CLOUDINARY_API_SECRET: "secret",
          STOREFRONT_URL: "https://greenroots.farm",
          GEOCODING_DRIVER: "vietmap",
        }),
      ).toThrow("VIETMAP_API_KEY");
    });
  });
});
