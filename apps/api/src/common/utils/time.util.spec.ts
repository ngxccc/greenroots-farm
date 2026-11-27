import { describe, expect, it } from "bun:test";
import {
  daysToMs,
  daysToSeconds,
  formatVnCalendarDate,
  formatVnCompactDate,
  getExpiryDate,
  getPastDate,
  hoursToMs,
  hoursToSeconds,
  minutesToMs,
  minutesToSeconds,
  parseDuration,
  secondsToMs,
} from "./time.util";

describe("time.util", () => {
  describe("conversion functions", () => {
    it("converts seconds to ms", () => {
      expect(secondsToMs(1)).toBe(1_000);
      expect(secondsToMs(60)).toBe(60_000);
    });

    it("converts minutes to seconds and ms", () => {
      expect(minutesToSeconds(1)).toBe(60);
      expect(minutesToSeconds(15)).toBe(900);
      expect(minutesToMs(1)).toBe(60_000);
      expect(minutesToMs(15)).toBe(900_000);
    });

    it("converts hours to seconds and ms", () => {
      expect(hoursToSeconds(1)).toBe(3_600);
      expect(hoursToSeconds(24)).toBe(86_400);
      expect(hoursToMs(1)).toBe(3_600_000);
      expect(hoursToMs(24)).toBe(86_400_000);
    });

    it("converts days to seconds and ms", () => {
      expect(daysToSeconds(1)).toBe(86_400);
      expect(daysToSeconds(7)).toBe(604_800);
      expect(daysToMs(1)).toBe(86_400_000);
      expect(daysToMs(7)).toBe(604_800_000);
    });
  });

  describe("parseDuration", () => {
    it("parses seconds unit 's'", () => {
      expect(parseDuration("30s")).toBe(30_000);
    });

    it("parses minutes unit 'm'", () => {
      expect(parseDuration("15m")).toBe(15 * 60_000);
    });

    it("parses hours unit 'h'", () => {
      expect(parseDuration("2h")).toBe(2 * 3_600_000);
    });

    it("parses days unit 'd'", () => {
      expect(parseDuration("7d")).toBe(7 * 86_400_000);
    });

    it("parses weeks unit 'w'", () => {
      expect(parseDuration("1w")).toBe(7 * 86_400_000);
    });

    it("handles numeric input directly", () => {
      expect(parseDuration(10)).toBe(10_000);
    });

    it("falls back to defaultMs on invalid input", () => {
      expect(parseDuration("invalid", 5_000)).toBe(5_000);
    });
  });

  describe("getExpiryDate and getPastDate", () => {
    it("calculates future expiry date accurately", () => {
      const base = new Date("2026-11-16T12:00:00.000Z");
      const expiry = getExpiryDate("15m", base);
      expect(expiry.toISOString()).toBe("2026-11-16T12:15:00.000Z");
    });

    it("calculates past date accurately", () => {
      const base = new Date("2026-11-16T12:00:00.000Z");
      const past = getPastDate("1h", base);
      expect(past.toISOString()).toBe("2026-11-16T11:00:00.000Z");
    });
  });

  describe("formatVnCalendarDate and formatVnCompactDate", () => {
    it("formats UTC instants using Asia/Ho_Chi_Minh calendar boundaries", () => {
      const lateUtcAug31 = new Date("2026-08-31T21:00:00.000Z");

      expect(formatVnCalendarDate(lateUtcAug31)).toBe("2026-09-01");
      expect(formatVnCompactDate(lateUtcAug31)).toBe("20260901");
    });
  });
});
