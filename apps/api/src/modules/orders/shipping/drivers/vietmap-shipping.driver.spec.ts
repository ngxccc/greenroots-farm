import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { BUSINESS_RULES } from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import type { RedisService } from "@/common/services/redis.service";
import type { TraceCacheService } from "@/modules/farms/trace-cache.service";
import { HaversineShippingDriver } from "./haversine-shipping.driver";
import { VietmapShippingDriver } from "./vietmap-shipping.driver";

describe("VietmapShippingDriver", () => {
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
  const originalKey = env.VIETMAP_API_KEY;
  let redisStore: Map<string, string>;
  let farmVersion: string | null;
  let redisGetImpl: (key: string) => Promise<string | null>;
  let redisSetImpl: (key: string, value: string) => Promise<string>;
  let driver: VietmapShippingDriver;
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
    (env as { VIETMAP_API_KEY?: string }).VIETMAP_API_KEY =
      "vietmap-secret-key-456";

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
    driver = new VietmapShippingDriver(
      mockRedisService,
      mockTraceCacheService,
      haversineDriver,
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (env as { VIETMAP_API_KEY?: string }).VIETMAP_API_KEY = originalKey;
  });

  describe("calculateQuote", () => {
    it("computes road distance quote from Vietmap Matrix and caches in Redis", async () => {
      let fetchCalls = 0;
      globalThis.fetch = mock((input: string | URL | Request) => {
        fetchCalls += 1;
        const url = typeof input === "string" ? input : "";
        expect(url).toContain("https://maps.vietmap.vn/api/matrix/v4");
        expect(url).toContain("vehicle=motorcycle");
        expect(url).toContain("annotation=distance");
        expect(url).toContain("apikey=vietmap-secret-key-456");
        return Promise.resolve(
          new Response(JSON.stringify({ distances: [[7200]] }), {
            status: 200,
          }),
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
      expect(first.roadDistanceKm).toBe(7.2);
      expect(first.feeVnd).toBe(40_000);
      expect(second).toEqual(first);
    });

    it("invalidates cached road distance when farmVersion rotates", async () => {
      let distanceMeters = 4500;
      let fetchCalls = 0;
      globalThis.fetch = mock(() => {
        fetchCalls += 1;
        return Promise.resolve(
          new Response(JSON.stringify({ distances: [[distanceMeters]] }), {
            status: 200,
          }),
        );
      }) as unknown as typeof fetch;

      const first = await driver.calculateQuote({
        origin,
        destination,
        config: baseConfig,
        isSubscription: false,
      });
      expect(first.roadDistanceKm).toBe(4.5);

      farmVersion = "ver-2";
      distanceMeters = 10_500;
      const second = await driver.calculateQuote({
        origin,
        destination,
        config: baseConfig,
        isSubscription: false,
      });

      expect(fetchCalls).toBe(2);
      expect(second.roadDistanceKm).toBe(10.5);
    });

    it("fails open when Redis cache or farmVersion lookup errors", async () => {
      farmVersion = null;
      redisGetImpl = () => Promise.reject(new Error("Redis read failed"));
      redisSetImpl = () => Promise.reject(new Error("Redis write failed"));
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify({ distances: [[3600]] }), {
            status: 200,
          }),
        ),
      ) as unknown as typeof fetch;

      const result = await driver.calculateQuote({
        origin,
        destination,
        config: baseConfig,
        isSubscription: false,
      });

      expect(result.roadDistanceKm).toBe(3.6);
      expect(result.isDeliverable).toBe(true);
    });

    it("retries with car vehicle when motorcycle matrix returns negative distance", async () => {
      const requestedVehicles: string[] = [];
      globalThis.fetch = mock((input: string | URL | Request) => {
        const rawUrl = typeof input === "string" ? input : "";
        const vehicle = new URL(rawUrl).searchParams.get("vehicle") ?? "";
        requestedVehicles.push(vehicle);
        const distance = vehicle === "motorcycle" ? -1 : 10_505.3;
        return Promise.resolve(
          new Response(
            JSON.stringify({ code: "OK", distances: [[distance]] }),
            { status: 200 },
          ),
        );
      }) as unknown as typeof fetch;

      const result = await driver.calculateQuote({
        origin,
        destination,
        config: baseConfig,
        isSubscription: false,
      });

      expect(requestedVehicles).toEqual(["motorcycle", "car"]);
      expect(result.roadDistanceKm).toBe(10.51);
      expect(result.isDeliverable).toBe(true);
    });

    it("surfaces Vietmap error code and messages when matrix returns non-OK payload", async () => {
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
          Promise.resolve(
            new Response(
              JSON.stringify({
                code: "INVALID_REQUEST",
                messages: ["Point 0 is out of range"],
              }),
              { status: 200 },
            ),
          ),
        ) as unknown as typeof fetch;

        const quote = await driver.calculateQuote({
          origin,
          destination,
          config: baseConfig,
          isSubscription: false,
        });

        expect(quote).toEqual(expectedHaversine);
        expect(loggedWarnings[0]).toContain(
          "Vietmap matrix INVALID_REQUEST: Point 0 is out of range",
        );
      } finally {
        logger.warn = originalWarn;
      }
    });

    it("falls back to HaversineShippingDriver on locked or unauthorized upstream responses and redacts secrets", async () => {
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

        // Vietmap 401 returns empty body; 423 returns plain text.
        for (const upstreamResponse of [
          () => new Response(null, { status: 401 }),
          () => new Response("Account locked", { status: 423 }),
          () => new Response("upstream error", { status: 500 }),
          () =>
            new Response(JSON.stringify({ distances: [[]] }), { status: 200 }),
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

        globalThis.fetch = mock(() =>
          Promise.reject(
            new Error(
              "Timeout calling https://maps.vietmap.vn/api/matrix/v4?apikey=vietmap-secret-key-456",
            ),
          ),
        ) as unknown as typeof fetch;

        const onTimeout = await driver.calculateQuote({
          origin,
          destination,
          config: baseConfig,
          isSubscription: false,
        });
        expect(onTimeout).toEqual(expectedHaversine);
        expect(loggedWarnings[4]).toContain("[REDACTED]");
        expect(loggedWarnings[4]).not.toContain("vietmap-secret-key-456");

        (env as { VIETMAP_API_KEY?: string }).VIETMAP_API_KEY = undefined;
        const onMissingKey = await driver.calculateQuote({
          origin,
          destination,
          config: baseConfig,
          isSubscription: false,
        });
        expect(onMissingKey).toEqual(expectedHaversine);
      } finally {
        logger.warn = originalWarn;
      }
    });
  });
});
