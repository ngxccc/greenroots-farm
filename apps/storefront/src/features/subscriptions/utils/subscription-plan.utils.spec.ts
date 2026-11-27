import { describe, expect, it } from "bun:test";
import { DeliveryDay } from "@greenroots/shared";
import {
  SUBSCRIPTION_DELIVERY_OPTIONS,
  calculateSubscriptionWeeks,
  formatSubscriptionDurationLabel,
} from "./subscription-plan.utils";

describe("SubscriptionPlanUtils", () => {
  describe("calculateSubscriptionWeeks", () => {
    // Invariant: INV-SF04-2
    it("calculates one week per delivery when schedule is tuesday or friday", () => {
      expect(calculateSubscriptionWeeks(4, DeliveryDay.TUESDAY)).toBe(4);
      expect(calculateSubscriptionWeeks(8, DeliveryDay.FRIDAY)).toBe(8);
    });

    // Invariant: INV-SF04-2
    it("calculates half weeks rounded up when schedule is both days", () => {
      expect(calculateSubscriptionWeeks(8, DeliveryDay.BOTH)).toBe(4);
      expect(calculateSubscriptionWeeks(12, DeliveryDay.BOTH)).toBe(6);
      expect(calculateSubscriptionWeeks(5, DeliveryDay.BOTH)).toBe(3);
    });

    it("returns zero when totalDeliveries is zero or negative", () => {
      expect(calculateSubscriptionWeeks(0, DeliveryDay.BOTH)).toBe(0);
      expect(calculateSubscriptionWeeks(-2, DeliveryDay.TUESDAY)).toBe(0);
    });
  });

  describe("formatSubscriptionDurationLabel", () => {
    it("formats Vietnamese duration and trips per week for single-day and dual-day schedules", () => {
      expect(formatSubscriptionDurationLabel(8, DeliveryDay.TUESDAY)).toBe(
        "8 tuần (1 chuyến/tuần)",
      );
      expect(formatSubscriptionDurationLabel(8, DeliveryDay.BOTH)).toBe(
        "4 tuần (2 chuyến/tuần)",
      );
    });
  });

  describe("SUBSCRIPTION_DELIVERY_OPTIONS", () => {
    it("exposes tuesday, friday, and both delivery day options with shared labels", () => {
      expect(SUBSCRIPTION_DELIVERY_OPTIONS.map((item) => item.day)).toEqual([
        DeliveryDay.TUESDAY,
        DeliveryDay.FRIDAY,
        DeliveryDay.BOTH,
      ]);
      for (const option of SUBSCRIPTION_DELIVERY_OPTIONS) {
        expect(option.label.length).toBeGreaterThan(0);
        expect(option.timeWindow).toBe("06:30 – 09:00");
      }
    });
  });
});
