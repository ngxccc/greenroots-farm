import { describe, expect, test } from "bun:test";
import { BUSINESS_RULES } from "./business.constants";
import {
  calculateHaversineDistanceKm,
  calculateRoadDistanceKm,
  estimateDeliveryQuote,
  HCMC_DISTRICTS,
} from "./haversine";

describe("HCMC districts and Haversine shipping quote", () => {
  test("provides 24 HCMC district coordinates", () => {
    expect(HCMC_DISTRICTS).toHaveLength(24);
  });

  test("returns zero distance for identical origin and destination", () => {
    const { LATITUDE, LONGITUDE } = BUSINESS_RULES.FARM_COORDINATES;
    expect(
      calculateHaversineDistanceKm(LATITUDE, LONGITUDE, LATITUDE, LONGITUDE),
    ).toBe(0);
    expect(
      calculateRoadDistanceKm(LATITUDE, LONGITUDE, LATITUDE, LONGITUDE),
    ).toBe(0);
  });

  test("charges base 15,000 VND within 3km and 5,000 VND per extra km ceiling", () => {
    const cuChi = HCMC_DISTRICTS.find((d) => d.code === "cu-chi")!;
    const quote = estimateDeliveryQuote(cuChi.latitude, cuChi.longitude);

    expect(quote.isDeliverable).toBe(true);
    expect(quote.feeVnd).toBeGreaterThanOrEqual(
      BUSINESS_RULES.SHIPPING.BASE_FEE_VND,
    );
  });

  test("rejects single-order deliveries beyond 25km road distance", () => {
    const canGio = HCMC_DISTRICTS.find((d) => d.code === "can-gio")!;
    const quote = estimateDeliveryQuote(canGio.latitude, canGio.longitude);

    expect(quote.roadDistanceKm).toBeGreaterThan(25);
    expect(quote.isDeliverable).toBe(false);
  });

  test("applies zero shipping fee for eligible subscription deliveries within 20km", () => {
    const cuChi = HCMC_DISTRICTS.find((d) => d.code === "cu-chi")!;
    const quote = estimateDeliveryQuote(cuChi.latitude, cuChi.longitude, {
      isSubscription: true,
    });

    expect(quote.feeVnd).toBe(0);
    expect(quote.isDeliverable).toBe(true);
  });
});
