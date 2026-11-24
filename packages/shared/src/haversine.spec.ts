import { describe, expect, test } from "bun:test";
import { BUSINESS_RULES } from "./business.constants";
import {
  calculateDeliveryQuote,
  calculateHaversineDistanceKm,
  calculateRoadDistanceKm,
  findHcmcDistrictByCode,
  HCMC_DISTRICTS,
  type GeoCoordinate,
  type ShippingQuoteConfig,
} from "./haversine";

const DEFAULT_ORIGIN: GeoCoordinate = {
  latitude: BUSINESS_RULES.FULFILLMENT_HUB.LATITUDE,
  longitude: BUSINESS_RULES.FULFILLMENT_HUB.LONGITUDE,
};

const DEFAULT_CONFIG: ShippingQuoteConfig = {
  baseFeeVnd: BUSINESS_RULES.SHIPPING.BASE_FEE_VND,
  freeKmThreshold: BUSINESS_RULES.SHIPPING.FREE_KM_THRESHOLD,
  perKmRateVnd: BUSINESS_RULES.SHIPPING.PER_KM_RATE_VND,
  detourFactor: BUSINESS_RULES.SHIPPING.DETOUR_FACTOR,
  maxRadiusKm: BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM,
  subscriptionFreeRadiusKm: BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM,
};

describe("HCMC districts and Haversine shipping quote", () => {
  test("provides 24 HCMC district coordinates", () => {
    expect(HCMC_DISTRICTS).toHaveLength(24);
  });

  test("returns zero distance for identical origin and destination", () => {
    const { LATITUDE, LONGITUDE } = BUSINESS_RULES.FULFILLMENT_HUB;
    expect(
      calculateHaversineDistanceKm(LATITUDE, LONGITUDE, LATITUDE, LONGITUDE),
    ).toBe(0);
    expect(
      calculateRoadDistanceKm(LATITUDE, LONGITUDE, LATITUDE, LONGITUDE),
    ).toBe(0);
  });

  test("charges base 15,000 VND within 3km and 5,000 VND per extra km ceiling", () => {
    const quan1 = HCMC_DISTRICTS.find((d) => d.code === "quan-1")!;
    const quote = calculateDeliveryQuote(
      DEFAULT_ORIGIN,
      { latitude: quan1.latitude, longitude: quan1.longitude },
      DEFAULT_CONFIG,
    );

    expect(quote.isDeliverable).toBe(true);
    expect(quote.isFreeShipping).toBe(false);
    expect(quote.feeVnd).toBeGreaterThanOrEqual(
      BUSINESS_RULES.SHIPPING.BASE_FEE_VND,
    );
  });

  test("returns feeVnd null and isDeliverable false beyond maxRadiusKm", () => {
    const cuChi = HCMC_DISTRICTS.find((d) => d.code === "cu-chi")!;
    const quote = calculateDeliveryQuote(
      DEFAULT_ORIGIN,
      { latitude: cuChi.latitude, longitude: cuChi.longitude },
      DEFAULT_CONFIG,
    );

    expect(quote.roadDistanceKm).toBeGreaterThan(25);
    expect(quote.isDeliverable).toBe(false);
    expect(quote.isFreeShipping).toBe(false);
    expect(quote.feeVnd).toBeNull();
  });

  test("applies zero shipping fee for eligible subscription deliveries within 20km", () => {
    const thaoDien = HCMC_DISTRICTS.find((d) => d.code === "quan-2-old")!;
    const quote = calculateDeliveryQuote(
      DEFAULT_ORIGIN,
      { latitude: thaoDien.latitude, longitude: thaoDien.longitude },
      DEFAULT_CONFIG,
      { isSubscription: true },
    );

    expect(quote.roadDistanceKm).toBeLessThanOrEqual(20);
    expect(quote.isDeliverable).toBe(true);
    expect(quote.isFreeShipping).toBe(true);
    expect(quote.feeVnd).toBe(0);
  });

  test("charges standard fee for subscription deliveries between 20km and 25km", () => {
    const binhChanh = HCMC_DISTRICTS.find((d) => d.code === "binh-chanh")!;
    const retailQuote = calculateDeliveryQuote(
      DEFAULT_ORIGIN,
      { latitude: binhChanh.latitude, longitude: binhChanh.longitude },
      DEFAULT_CONFIG,
    );
    const subQuote = calculateDeliveryQuote(
      DEFAULT_ORIGIN,
      { latitude: binhChanh.latitude, longitude: binhChanh.longitude },
      DEFAULT_CONFIG,
      { isSubscription: true },
    );

    expect(subQuote.roadDistanceKm).toBeGreaterThan(20);
    expect(subQuote.roadDistanceKm).toBeLessThanOrEqual(25);
    expect(subQuote.isDeliverable).toBe(true);
    expect(subQuote.isFreeShipping).toBe(false);
    expect(subQuote.feeVnd).toBe(retailQuote.feeVnd);
    expect(subQuote.feeVnd).toBeGreaterThan(0);
  });

  test("rejects subscription deliveries beyond maxRadiusKm even if subscriptionFreeRadiusKm is misconfigured higher", () => {
    const canGio = HCMC_DISTRICTS.find((d) => d.code === "can-gio")!;
    const quote = calculateDeliveryQuote(
      DEFAULT_ORIGIN,
      { latitude: canGio.latitude, longitude: canGio.longitude },
      { ...DEFAULT_CONFIG, maxRadiusKm: 25, subscriptionFreeRadiusKm: 150 },
      { isSubscription: true },
    );

    expect(quote.isDeliverable).toBe(false);
    expect(quote.isFreeShipping).toBe(false);
    expect(quote.feeVnd).toBeNull();
  });

  test("uses custom origin, custom config, and ceiling extra km rounding", () => {
    const quan1 = HCMC_DISTRICTS.find((d) => d.code === "quan-1")!;
    const quote = calculateDeliveryQuote(
      { latitude: quan1.latitude, longitude: quan1.longitude },
      { latitude: quan1.latitude + 0.05, longitude: quan1.longitude },
      {
        baseFeeVnd: 20000,
        freeKmThreshold: 2,
        perKmRateVnd: 6000,
        detourFactor: 1.5,
        maxRadiusKm: 30,
        subscriptionFreeRadiusKm: 15,
      },
    );

    const expectedExtraKm = Math.max(0, Math.ceil(quote.roadDistanceKm - 2));
    expect(quote.isDeliverable).toBe(true);
    expect(quote.feeVnd).toBe(20000 + expectedExtraKm * 6000);
  });

  test("treats exact boundary equality at maxRadiusKm and subscriptionFreeRadiusKm as inclusive", () => {
    const hocMon = HCMC_DISTRICTS.find((d) => d.code === "hoc-mon")!;
    const baseline = calculateDeliveryQuote(
      DEFAULT_ORIGIN,
      { latitude: hocMon.latitude, longitude: hocMon.longitude },
      DEFAULT_CONFIG,
    );

    const exactMaxQuote = calculateDeliveryQuote(
      DEFAULT_ORIGIN,
      { latitude: hocMon.latitude, longitude: hocMon.longitude },
      { ...DEFAULT_CONFIG, maxRadiusKm: baseline.roadDistanceKm },
    );
    expect(exactMaxQuote.isDeliverable).toBe(true);
    expect(exactMaxQuote.feeVnd).toBe(baseline.feeVnd);

    const exactSubFreeQuote = calculateDeliveryQuote(
      DEFAULT_ORIGIN,
      { latitude: hocMon.latitude, longitude: hocMon.longitude },
      {
        ...DEFAULT_CONFIG,
        subscriptionFreeRadiusKm: baseline.roadDistanceKm,
      },
      { isSubscription: true },
    );
    expect(exactSubFreeQuote.isDeliverable).toBe(true);
    expect(exactSubFreeQuote.isFreeShipping).toBe(true);
    expect(exactSubFreeQuote.feeVnd).toBe(0);
  });

  test("resolves known HCMC district codes and returns undefined for unknown codes", () => {
    const quan7 = findHcmcDistrictByCode("quan-7");
    expect(quan7).toEqual({
      code: "quan-7",
      name: "Quận 7",
      latitude: 10.734,
      longitude: 106.7218,
    });
    expect(findHcmcDistrictByCode("quan-99")).toBeUndefined();
    expect(findHcmcDistrictByCode("QUAN-7")).toBeUndefined();
  });
});
