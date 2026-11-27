import { describe, expect, it } from "bun:test";
import { BUSINESS_RULES, DeliveryDay } from "@greenroots/shared";
import type { ShippingQuote } from "@/features/shipping/types/shipping.types";
import type { StorefrontSubscriptionPlan } from "@/types/subscription.types";
import {
  buildSubscriptionCheckoutSignature,
  calculateSubscriptionCheckoutTotals,
} from "./subscription-checkout.utils";

const SAMPLE_PLAN: StorefrontSubscriptionPlan = {
  id: "0195a8f0-0001-7000-8000-000000000101",
  slug: "goi-co-ban-4-chuyen",
  name: "Gói Cơ Bản",
  description: "Phù hợp hộ 1–2 người ăn rau hàng tuần.",
  priceVnd: 520_000,
  totalDeliveries: 4,
  weightPerDeliveryKg: 3,
  basketDescription: "3 kg rau củ hữu cơ đa dạng theo mùa",
  isActive: true,
  unitPriceVnd: 130_000,
};

describe("subscription-checkout.utils", () => {
  describe("buildSubscriptionCheckoutSignature", () => {
    // Invariant: INV-SF04-4
    it("produces identical signature for identical selection and rotates when plan, address, or deliveryDay changes", () => {
      const base = buildSubscriptionCheckoutSignature({
        planId: SAMPLE_PLAN.id,
        addressId: "0195a8f0-0001-7000-8000-000000000201",
        deliveryDay: DeliveryDay.BOTH,
      });
      const same = buildSubscriptionCheckoutSignature({
        planId: SAMPLE_PLAN.id,
        addressId: "0195a8f0-0001-7000-8000-000000000201",
        deliveryDay: DeliveryDay.BOTH,
      });
      const diffPlan = buildSubscriptionCheckoutSignature({
        planId: "0195a8f0-0001-7000-8000-000000000102",
        addressId: "0195a8f0-0001-7000-8000-000000000201",
        deliveryDay: DeliveryDay.BOTH,
      });
      const diffAddress = buildSubscriptionCheckoutSignature({
        planId: SAMPLE_PLAN.id,
        addressId: "0195a8f0-0001-7000-8000-000000000202",
        deliveryDay: DeliveryDay.BOTH,
      });
      const diffDay = buildSubscriptionCheckoutSignature({
        planId: SAMPLE_PLAN.id,
        addressId: "0195a8f0-0001-7000-8000-000000000201",
        deliveryDay: DeliveryDay.TUESDAY,
      });

      expect(same).toBe(base);
      expect(diffPlan).not.toBe(base);
      expect(diffAddress).not.toBe(base);
      expect(diffDay).not.toBe(base);
    });
  });

  describe("calculateSubscriptionCheckoutTotals", () => {
    // Invariant: INV-SF04-3
    it("computes zero shipping and plan price total within subscriptionFreeRadiusKm", () => {
      const freeQuote: ShippingQuote = {
        straightLineKm: 12,
        roadDistanceKm: 15,
        feeVnd: 0,
        isDeliverable: true,
        isFreeShipping: true,
        maxRadiusKm: BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM,
        subscriptionFreeRadiusKm:
          BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM,
      };

      const totals = calculateSubscriptionCheckoutTotals(
        SAMPLE_PLAN,
        freeQuote,
      );

      expect(totals.isFreeShipping).toBe(true);
      expect(totals.shippingFeePerDeliveryVnd).toBe(0);
      expect(totals.totalShippingFeeVnd).toBe(0);
      expect(totals.totalAmountVnd).toBe(520_000);
    });

    // Invariant: INV-SF04-3
    it("multiplies per-delivery fee by totalDeliveries outside subscriptionFreeRadiusKm", () => {
      const paidQuote: ShippingQuote = {
        straightLineKm: 20,
        roadDistanceKm: 24,
        feeVnd: 35_000,
        isDeliverable: true,
        isFreeShipping: false,
        maxRadiusKm: BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM,
        subscriptionFreeRadiusKm:
          BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM,
      };

      const totals = calculateSubscriptionCheckoutTotals(
        SAMPLE_PLAN,
        paidQuote,
      );

      expect(totals.isFreeShipping).toBe(false);
      expect(totals.shippingFeePerDeliveryVnd).toBe(35_000);
      expect(totals.totalShippingFeeVnd).toBe(140_000);
      expect(totals.totalAmountVnd).toBe(660_000);
    });

    // Invariant: INV-SF04-3
    it("returns null shipping and total when quote is missing or out of radius", () => {
      const outOfRadiusQuote: ShippingQuote = {
        straightLineKm: 32,
        roadDistanceKm: 38,
        feeVnd: null,
        isDeliverable: false,
        isFreeShipping: false,
        maxRadiusKm: BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM,
        subscriptionFreeRadiusKm:
          BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM,
      };

      expect(calculateSubscriptionCheckoutTotals(SAMPLE_PLAN, null)).toEqual({
        isFreeShipping: false,
        shippingFeePerDeliveryVnd: null,
        totalShippingFeeVnd: null,
        totalAmountVnd: null,
      });

      expect(
        calculateSubscriptionCheckoutTotals(SAMPLE_PLAN, outOfRadiusQuote),
      ).toEqual({
        isFreeShipping: false,
        shippingFeePerDeliveryVnd: null,
        totalShippingFeeVnd: null,
        totalAmountVnd: null,
      });
    });
  });
});
