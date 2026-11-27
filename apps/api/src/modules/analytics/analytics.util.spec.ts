import { describe, expect, it } from "bun:test";
import {
  addDaysToIsoDate,
  computeWasteRatio,
  generateContiguousBuckets,
  getInclusiveDaySpan,
  getIsoWeekMonday,
  getTodayInHoChiMinh,
  hoChiMinhStartOfDayUtc,
  roundQuantity2dp,
} from "./analytics.util";

describe("AnalyticsUtil", () => {
  describe("getTodayInHoChiMinh", () => {
    it("shifts UTC instant by +07:00 before extracting calendar date", () => {
      // 2026-11-01T22:00:00Z is 2026-11-02T05:00:00+07:00
      const instant = new Date("2026-11-01T22:00:00.000Z");
      expect(getTodayInHoChiMinh(instant)).toBe("2026-11-02");
    });
  });

  describe("hoChiMinhStartOfDayUtc", () => {
    it("maps YYYY-MM-DD 00:00:00+07:00 to the exact UTC instant", () => {
      const utc = hoChiMinhStartOfDayUtc("2026-11-02");
      expect(utc.toISOString()).toBe("2026-11-01T17:00:00.000Z");
    });
  });

  describe("addDaysToIsoDate and getInclusiveDaySpan", () => {
    it("computes inclusive span across month and leap-year boundaries", () => {
      expect(addDaysToIsoDate("2026-11-01", 29)).toBe("2026-11-30");
      expect(getInclusiveDaySpan("2026-11-01", "2026-11-30")).toBe(30);
      expect(getInclusiveDaySpan("2026-01-01", "2026-12-31")).toBe(365);
    });
  });

  describe("getIsoWeekMonday", () => {
    it("returns Monday of the ISO week for weekdays and Sunday", () => {
      expect(getIsoWeekMonday("2026-11-23")).toBe("2026-11-23"); // Monday
      expect(getIsoWeekMonday("2026-11-27")).toBe("2026-11-23"); // Friday
      expect(getIsoWeekMonday("2026-11-29")).toBe("2026-11-23"); // Sunday
    });
  });

  describe("generateContiguousBuckets", () => {
    it("generates contiguous daily buckets across month boundary", () => {
      expect(
        generateContiguousBuckets("2026-10-30", "2026-11-02", "day"),
      ).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    });

    it("generates contiguous Monday-start weekly buckets", () => {
      expect(
        generateContiguousBuckets("2026-11-18", "2026-12-02", "week"),
      ).toEqual(["2026-11-16", "2026-11-23", "2026-11-30"]);
    });

    it("generates contiguous monthly buckets across year boundary", () => {
      expect(
        generateContiguousBuckets("2026-11-15", "2027-02-01", "month"),
      ).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    });
  });

  describe("computeWasteRatio and roundQuantity2dp", () => {
    it("returns 0 when initialQuantity is zero and rounds non-zero ratios to 4 decimal places", () => {
      // Invariant: INV-4
      expect(computeWasteRatio(5, 0)).toBe(0);
      expect(computeWasteRatio(0, 0)).toBe(0);
      expect(computeWasteRatio(1, 3)).toBe(0.3333);
      expect(computeWasteRatio(10, 10)).toBe(1);
      expect(roundQuantity2dp(12.345)).toBe(12.35);
    });
  });
});
