import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { BUSINESS_RULES } from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import type { RedisService } from "@/common/services/redis.service";
import type { TraceCacheService } from "@/modules/farms/trace-cache.service";
import { GoongShippingDriver } from "./goong-shipping.driver";
import { HaversineShippingDriver } from "./haversine-shipping.driver";

describe("GoongShippingDriver", () => {
  const origin = {
    latitude: BUSINESS_RULES.FULFILLMENT_HUB.LATITUDE,
    longitude: BUSINESS_RULES.FULFILLMENT_HUB.LONGITUDE,
  };
  const destination = { latitude: 10.776889, longitude: 106.700806 };
  const baseConfig = {
    baseFeeVnd: BUSINESS_RULES.SHIPPING.BASE_FEE_VND,
    freeKmThreshold: BUSINESS_RULES.SHIPPING.FREE_KM_THRESHOLD,
    perKmRateVnd: BUSINESS_RULES.SHIPPING.PER_KM_RATE_VND,
    detourFactor: BUSINESS_RULES.SHIPPING.DETOUR_FACTOR,
    maxRadiusKm: BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM,
    subscriptionFreeRadiusKm:
      BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM,
  };

  const originalFetch = globalThis.fetch;
  const originalKey = env.GOONG_API_KEY;
  let redisStore: Map<string, string>;
  let farmVersion: string | null;
  let redisGetImpl: (key: string) => Promise<string | null>;
  let redisSetImpl: (key: string, value: string) => Promise<string>;
  let driver: GoongShippingDriver;
  let haversineDriver: HaversineShippingDriver;

  beforeEach(() => {
    redisStore = new Map();
    farmVersion = "ver-1";
    redisGetImpl = (key: string) =>
      Promise.resolve(redisStore.get(key) ?? null);
    redisSetImpl = (key: string, value: string) => {
      redisStore.set(key, value);
      return Promise.resolve("OK");
    };
    (env as { GOONG_API_KEY?: string }).GOONG_API_KEY = "goong-secret-key-123";

    const mockRedisService = {
      getClient: () => ({
        get: mock((key: string) => redisGetImpl(key)),
        set: mock((key: string, value: string) => redisSetImpl(key, value)),
      }),
    } as unknown as RedisService;

    const mockTraceCacheService = {
      ensureFarmVersion: mock(() => Promise.resolve(farmVersion)),
    } as unknown as TraceCacheService;

    haversineDriver = new HaversineShippingDriver();
    driver = new GoongShippingDriver(
      mockRedisService,
      mockTraceCacheService,
      haversineDriver,
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (env as { GOONG_API_KEY?: string }).GOONG_API_KEY = originalKey;
  });

  describe("calculateQuote", () => {
    it("computes road distance quote from Goong Distance Matrix and caches in Redis", async () => {
      let fetchCalls = 0;
      globalThis.fetch = mock((input: string | URL | Request) => {
        fetchCalls += 1;
        const url = typeof input === "string" ? input : "";
        expect(url).toContain("https://rsapi.goong.io/DistanceMatrix");
        expect(url).toContain("vehicle=bike");
        expect(url).toContain("api_key=goong-secret-key-123");
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                { elements: [{ status: "OK", distance: { value: 6400 } }] },
              ],
            }),
            { status: 200 },
          ),
        );
      }) as unknown as typeof fetch;

      const first = await driver.calculateQuote({
        origin,
        destination,
        config: baseConfig,
        isSubscription: false,
      });
      const second = await driver.calculateQuote({
        origin,
        destination,
        config: baseConfig,
        isSubscription: false,
      });

      expect(fetchCalls).toBe(1);
      expect(first.roadDistanceKm).toBe(6.4);
      expect(first.feeVnd).toBe(35_000);
      expect(second).toEqual(first);
    });

    it("applies subscription boundary rules and maxRadiusKm cutoff on road distance", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                { elements: [{ status: "OK", distance: { value: 22_000 } }] },
              ],
            }),
            { status: 200 },
          ),
        ),
      ) as unknown as typeof fetch;

      const subMidQuote = await driver.calculateQuote({
        origin,
        destination,
        config: baseConfig,
        isSubscription: true,
      });
      expect(subMidQuote.isDeliverable).toBe(true);
      expect(subMidQuote.isFreeShipping).toBe(false);
      expect(subMidQuote.feeVnd).toBeGreaterThan(0);

      farmVersion = "ver-2";
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                { elements: [{ status: "OK", distance: { value: 26_000 } }] },
              ],
            }),
            { status: 200 },
          ),
        ),
      ) as unknown as typeof fetch;

      const outOfRangeQuote = await driver.calculateQuote({
        origin,
        destination,
        config: baseConfig,
        isSubscription: true,
      });
      expect(outOfRangeQuote.isDeliverable).toBe(false);
      expect(outOfRangeQuote.feeVnd).toBeNull();
    });

    it("invalidates cached road distance when farmVersion rotates", async () => {
      let distanceMeters = 5000;
      let fetchCalls = 0;
      globalThis.fetch = mock(() => {
        fetchCalls += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                {
                  elements: [
                    { status: "OK", distance: { value: distanceMeters } },
                  ],
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }) as unknown as typeof fetch;

      const first = await driver.calculateQuote({
        origin,
        destination,
        config: baseConfig,
        isSubscription: false,
      });
      expect(first.roadDistanceKm).toBe(5);

      farmVersion = "ver-rotated";
      distanceMeters = 9000;
      const second = await driver.calculateQuote({
        origin,
        destination,
        config: baseConfig,
        isSubscription: false,
      });

      expect(fetchCalls).toBe(2);
      expect(second.roadDistanceKm).toBe(9);
    });

    it("fails open when Redis cache or farmVersion lookup errors", async () => {
      farmVersion = null;
      redisGetImpl = () => Promise.reject(new Error("Redis read failed"));
      redisSetImpl = () => Promise.reject(new Error("Redis write failed"));
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              rows: [
                { elements: [{ status: "OK", distance: { value: 4200 } }] },
              ],
            }),
            { status: 200 },
          ),
        ),
      ) as unknown as typeof fetch;

      const result = await driver.calculateQuote({
        origin,
        destination,
        config: baseConfig,
        isSubscription: false,
      });

      expect(result.roadDistanceKm).toBe(4.2);
      expect(result.isDeliverable).toBe(true);
    });

    it("falls back to HaversineShippingDriver and redacts secrets on upstream failures", async () => {
      // Invariant: INV-GEO-2
      // Invariant: INV-SHIP-1
      const loggedWarnings: string[] = [];
      const logger = (
        driver as unknown as { logger: { warn: (msg: string) => void } }
      ).logger;
      const originalWarn = logger.warn.bind(logger);
      logger.warn = (msg: string) => {
        loggedWarnings.push(msg);
      };

      try {
        const expectedHaversine = await haversineDriver.calculateQuote({
          origin,
          destination,
          config: baseConfig,
          isSubscription: false,
        });

        globalThis.fetch = mock(() =>
          Promise.reject(
            new Error(
              "Request failed for https://rsapi.goong.io/DistanceMatrix?api_key=goong-secret-key-123",
            ),
          ),
        ) as unknown as typeof fetch;

        const fallbackOnThrow = await driver.calculateQuote({
          origin,
          destination,
          config: baseConfig,
          isSubscription: false,
        });
        expect(fallbackOnThrow).toEqual(expectedHaversine);
        expect(loggedWarnings[0]).toContain("[REDACTED]");
        expect(loggedWarnings[0]).not.toContain("goong-secret-key-123");

        for (const upstreamResponse of [
          () => new Response("rate limited", { status: 429 }),
          () => new Response("upstream down", { status: 503 }),
          () =>
            new Response(
              JSON.stringify({
                rows: [{ elements: [{ status: "ZERO_RESULTS" }] }],
              }),
              { status: 200 },
            ),
        ]) {
          globalThis.fetch = mock(() =>
            Promise.resolve(upstreamResponse()),
          ) as unknown as typeof fetch;

          const fallbackQuote = await driver.calculateQuote({
            origin,
            destination,
            config: baseConfig,
            isSubscription: false,
          });
          expect(fallbackQuote).toEqual(expectedHaversine);
        }

        (env as { GOONG_API_KEY?: string }).GOONG_API_KEY = undefined;
        const fallbackMissingKey = await driver.calculateQuote({
          origin,
          destination,
          config: baseConfig,
          isSubscription: false,
        });
        expect(fallbackMissingKey).toEqual(expectedHaversine);
      } finally {
        logger.warn = originalWarn;
      }
    });
  });
});
