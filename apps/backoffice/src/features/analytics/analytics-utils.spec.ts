import { describe, expect, it } from "bun:test";
import { UserRole } from "@greenroots/shared";
import {
  buildOperationsAnalyticsQuery,
  canAccessOperationsAnalytics,
  formatCompactVnd,
  formatVnd,
  formatWasteRatioPercent,
  resolvePeriodRange,
} from "./analytics-utils";

describe("AnalyticsUtils", () => {
  describe("canAccessOperationsAnalytics", () => {
    it("allows admin and super_admin roles", () => {
      expect(canAccessOperationsAnalytics(UserRole.ADMIN)).toBe(true);
      expect(canAccessOperationsAnalytics(UserRole.SUPER_ADMIN)).toBe(true);
    });

    it("rejects farm_staff, sales, customer, and missing roles", () => {
      expect(canAccessOperationsAnalytics(UserRole.FARM_STAFF)).toBe(false);
      expect(canAccessOperationsAnalytics(UserRole.SALES)).toBe(false);
      expect(canAccessOperationsAnalytics(UserRole.CUSTOMER)).toBe(false);
      expect(canAccessOperationsAnalytics(undefined)).toBe(false);
      expect(canAccessOperationsAnalytics(null)).toBe(false);
    });
  });

  describe("resolvePeriodRange", () => {
    it("computes inclusive calendar bounds for 7d, 30d, and 90d presets", () => {
      const anchor = new Date(2026, 10, 28);

      expect(resolvePeriodRange("7d", anchor)).toEqual({
        from: "2026-11-22",
        to: "2026-11-28",
      });
      expect(resolvePeriodRange("30d", anchor)).toEqual({
        from: "2026-10-30",
        to: "2026-11-28",
      });
      expect(resolvePeriodRange("90d", anchor)).toEqual({
        from: "2026-08-31",
        to: "2026-11-28",
      });
    });
  });

  describe("buildOperationsAnalyticsQuery", () => {
    it("builds query parameters from preset range and granularity", () => {
      const anchor = new Date(2026, 10, 28);

      expect(
        buildOperationsAnalyticsQuery({
          preset: "7d",
          granularity: "day",
          referenceDate: anchor,
        }),
      ).toEqual({
        from: "2026-11-22",
        to: "2026-11-28",
        granularity: "day",
        topLimit: 10,
      });
    });

    it("builds query parameters from trimmed custom dates when preset is custom", () => {
      expect(
        buildOperationsAnalyticsQuery({
          preset: "custom",
          from: " 2026-11-01 ",
          to: " 2026-11-15 ",
          granularity: "week",
          topLimit: 5,
        }),
      ).toEqual({
        from: "2026-11-01",
        to: "2026-11-15",
        granularity: "week",
        topLimit: 5,
      });
    });

    it("omits empty custom date bounds instead of sending blank strings", () => {
      expect(
        buildOperationsAnalyticsQuery({
          preset: "custom",
          from: "   ",
          to: "",
          granularity: "month",
        }),
      ).toEqual({
        granularity: "month",
        topLimit: 10,
      });
    });
  });

  describe("formatVnd", () => {
    it("formats integer VND values with vi-VN grouping and suffix", () => {
      expect(formatVnd(1_250_000)).toBe("1.250.000đ");
      expect(formatVnd(0)).toBe("0đ");
    });
  });

  describe("formatCompactVnd", () => {
    it("formats millions, thousands, and small VND values for chart axes", () => {
      expect(formatCompactVnd(2_500_000)).toBe("2,5 tr");
      expect(formatCompactVnd(2_000_000)).toBe("2 tr");
      expect(formatCompactVnd(450_000)).toBe("450k");
      expect(formatCompactVnd(500)).toBe("500đ");
    });
  });

  describe("formatWasteRatioPercent", () => {
    it("formats wasteRatio fractions in [0, 1] as Vietnamese percentages", () => {
      expect(formatWasteRatioPercent(0)).toBe("0,0%");
      expect(formatWasteRatioPercent(0.014)).toBe("1,4%");
      expect(formatWasteRatioPercent(1)).toBe("100,0%");
    });

    it("clamps out-of-range ratios safely to [0, 1]", () => {
      expect(formatWasteRatioPercent(-0.2)).toBe("0,0%");
      expect(formatWasteRatioPercent(1.5)).toBe("100,0%");
    });
  });
});
