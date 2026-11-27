import { describe, expect, it } from "bun:test";
import {
  fetchLiveSubscriptionPlans,
  mapSubscriptionPlanDtoToStorefront,
  type SubscriptionPlansDeps,
} from "./subscription.service";
import type { SubscriptionPlanDto } from "@/types/subscription.types";

const ACTIVE_FAMILY_PLAN_DTO: SubscriptionPlanDto = {
  id: "0195a8f0-0001-7000-8000-000000000101",
  name: "Gói Gia Đình",
  slug: "goi-rau-gia-dinh-8-chuyen",
  description: "Phù hợp gia đình 3–4 người, thu hoạch tươi mỗi tuần.",
  priceVnd: 960000,
  totalDeliveries: 8,
  weightPerDeliveryKg: 4,
  basketDescription: "4 kg rau củ hữu cơ đa dạng theo mùa",
  isActive: true,
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
};

const INACTIVE_PLAN_DTO: SubscriptionPlanDto = {
  ...ACTIVE_FAMILY_PLAN_DTO,
  id: "0195a8f0-0001-7000-8000-000000000102",
  name: "Gói Cũ Ngừng Bán",
  slug: "goi-cu-ngung-ban",
  isActive: false,
};

describe("SubscriptionService", () => {
  describe("mapSubscriptionPlanDtoToStorefront", () => {
    // Invariant: INV-SF04-2
    it("maps real SubscriptionPlanDto fields and computes per-delivery unit price without fabricated discounts", () => {
      const mapped = mapSubscriptionPlanDtoToStorefront(ACTIVE_FAMILY_PLAN_DTO);

      expect(mapped).toEqual({
        id: "0195a8f0-0001-7000-8000-000000000101",
        name: "Gói Gia Đình",
        slug: "goi-rau-gia-dinh-8-chuyen",
        description: "Phù hợp gia đình 3–4 người, thu hoạch tươi mỗi tuần.",
        priceVnd: 960000,
        totalDeliveries: 8,
        weightPerDeliveryKg: 4,
        basketDescription: "4 kg rau củ hữu cơ đa dạng theo mùa",
        isActive: true,
        unitPriceVnd: 120000,
      });
    });

    it("rounds unit price to integer VND when priceVnd is not evenly divisible by totalDeliveries", () => {
      const mapped = mapSubscriptionPlanDtoToStorefront({
        ...ACTIVE_FAMILY_PLAN_DTO,
        priceVnd: 550000,
        totalDeliveries: 8,
      });

      expect(mapped.unitPriceVnd).toBe(68750);
    });
  });

  describe("fetchLiveSubscriptionPlans", () => {
    // Invariant: INV-SF04-2
    it("returns active mapped plans when GET /api/v1/subscription-plans succeeds", async () => {
      const deps: SubscriptionPlansDeps = {
        fetchPlans: () =>
          Promise.resolve({
            data: {
              success: true,
              data: [ACTIVE_FAMILY_PLAN_DTO, INACTIVE_PLAN_DTO],
            },
            response: new Response(null, { status: 200 }),
          }),
      };

      const result = await fetchLiveSubscriptionPlans(deps);

      expect(result.apiReachable).toBe(true);
      expect(result.plans).toHaveLength(1);
      expect(result.plans[0]?.id).toBe(ACTIVE_FAMILY_PLAN_DTO.id);
      expect(result.plans[0]?.unitPriceVnd).toBe(120000);
    });

    it("returns empty plans with reachable status when backend returns an empty active list", async () => {
      const deps: SubscriptionPlansDeps = {
        fetchPlans: () =>
          Promise.resolve({
            data: {
              success: true,
              data: [],
            },
            response: new Response(null, { status: 200 }),
          }),
      };

      const result = await fetchLiveSubscriptionPlans(deps);

      expect(result.apiReachable).toBe(true);
      expect(result.plans).toEqual([]);
    });

    it("degrades gracefully with apiReachable false when API returns an error or throws", async () => {
      const errorDeps: SubscriptionPlansDeps = {
        fetchPlans: () =>
          Promise.resolve({
            error: { status: 503, detail: "Service unavailable" },
            response: new Response(null, { status: 503 }),
          }),
      };
      const throwingDeps: SubscriptionPlansDeps = {
        fetchPlans: () => Promise.reject(new Error("ECONNREFUSED")),
      };

      const errorResult = await fetchLiveSubscriptionPlans(errorDeps);
      const thrownResult = await fetchLiveSubscriptionPlans(throwingDeps);

      expect(errorResult).toEqual({ plans: [], apiReachable: false });
      expect(thrownResult).toEqual({ plans: [], apiReachable: false });
    });
  });
});
