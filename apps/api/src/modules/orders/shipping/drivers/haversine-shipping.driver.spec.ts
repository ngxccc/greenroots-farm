import { describe, expect, it } from "bun:test";
import { BUSINESS_RULES, HCMC_DISTRICTS } from "@greenroots/shared";
import { HaversineShippingDriver } from "./haversine-shipping.driver";

describe("HaversineShippingDriver", () => {
  const driver = new HaversineShippingDriver();

  const origin = {
    latitude: BUSINESS_RULES.FARM_COORDINATES.LATITUDE,
    longitude: BUSINESS_RULES.FARM_COORDINATES.LONGITUDE,
  };

  const baseConfig = {
    baseFeeVnd: BUSINESS_RULES.SHIPPING.BASE_FEE_VND,
    freeKmThreshold: BUSINESS_RULES.SHIPPING.FREE_KM_THRESHOLD,
    perKmRateVnd: BUSINESS_RULES.SHIPPING.PER_KM_RATE_VND,
    detourFactor: BUSINESS_RULES.SHIPPING.DETOUR_FACTOR,
    maxRadiusKm: BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM,
    subscriptionFreeRadiusKm:
      BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM,
  };

  it("computes integer VND fees for deliverable retail destinations", async () => {
    const cuChi = HCMC_DISTRICTS.find((d) => d.code === "cu-chi")!;
    const result = await driver.calculateQuote({
      origin,
      destination: { latitude: cuChi.latitude, longitude: cuChi.longitude },
      config: baseConfig,
      isSubscription: false,
    });

    expect(result.isDeliverable).toBe(true);
    expect(result.isFreeShipping).toBe(false);
    expect(Number.isInteger(result.feeVnd)).toBe(true);
    expect(result.feeVnd).toBeGreaterThanOrEqual(baseConfig.baseFeeVnd);
  });

  it("returns feeVnd null when destination exceeds maxRadiusKm", async () => {
    const canGio = HCMC_DISTRICTS.find((d) => d.code === "can-gio")!;
    const result = await driver.calculateQuote({
      origin,
      destination: { latitude: canGio.latitude, longitude: canGio.longitude },
      config: baseConfig,
      isSubscription: true,
    });

    expect(result.isDeliverable).toBe(false);
    expect(result.isFreeShipping).toBe(false);
    expect(result.feeVnd).toBeNull();
  });

  it("applies zero fee within subscriptionFreeRadiusKm and standard fee between 20km and 25km", async () => {
    const cuChi = HCMC_DISTRICTS.find((d) => d.code === "cu-chi")!;
    const hocMon = HCMC_DISTRICTS.find((d) => d.code === "hoc-mon")!;

    const freeQuote = await driver.calculateQuote({
      origin,
      destination: { latitude: cuChi.latitude, longitude: cuChi.longitude },
      config: baseConfig,
      isSubscription: true,
    });
    const paidQuote = await driver.calculateQuote({
      origin,
      destination: { latitude: hocMon.latitude, longitude: hocMon.longitude },
      config: baseConfig,
      isSubscription: true,
    });

    expect(freeQuote).toMatchObject({
      isDeliverable: true,
      isFreeShipping: true,
      feeVnd: 0,
    });
    expect(paidQuote.isDeliverable).toBe(true);
    expect(paidQuote.isFreeShipping).toBe(false);
    expect(paidQuote.feeVnd).toBeGreaterThan(0);
  });
});
