import { describe, expect, it } from "bun:test";
import {
  formatSessionDeviceLabel,
  formatSessionIpAddress,
  formatSessionTimestamp,
  isMobileSessionDevice,
} from "./session-display";

describe("SessionDisplayUtils", () => {
  describe("formatSessionDeviceLabel", () => {
    it("formats browser and OS labels from standard user agent strings", () => {
      expect(
        formatSessionDeviceLabel(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        ),
      ).toBe("Chrome · Windows");

      expect(
        formatSessionDeviceLabel(
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
        ),
      ).toBe("Safari · iPhone");

      expect(
        formatSessionDeviceLabel(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
        ),
      ).toBe("Microsoft Edge · Windows");

      expect(
        formatSessionDeviceLabel(
          "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
        ),
      ).toBe("Firefox · Linux");
    });

    it("preserves custom labels and falls back when device name is null or blank", () => {
      expect(formatSessionDeviceLabel("GreenRoots Mobile/2.1")).toBe(
        "GreenRoots Mobile/2.1",
      );
      expect(formatSessionDeviceLabel(null)).toBe("Thiết bị không xác định");
      expect(formatSessionDeviceLabel("   \n\t  ")).toBe(
        "Thiết bị không xác định",
      );
    });
  });

  describe("isMobileSessionDevice", () => {
    it("detects mobile and tablet labels while excluding desktop browsers and null values", () => {
      expect(
        isMobileSessionDevice(
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)",
        ),
      ).toBe(true);
      expect(
        isMobileSessionDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8)"),
      ).toBe(true);
      expect(
        isMobileSessionDevice(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0",
        ),
      ).toBe(false);
      expect(isMobileSessionDevice(null)).toBe(false);
    });
  });

  describe("formatSessionIpAddress", () => {
    it("trims non-empty IP addresses and falls back when ip address is null or blank", () => {
      expect(formatSessionIpAddress(" 203.0.113.42 ")).toBe("203.0.113.42");
      expect(formatSessionIpAddress(null)).toBe("IP không xác định");
      expect(formatSessionIpAddress("   ")).toBe("IP không xác định");
    });
  });

  describe("formatSessionTimestamp", () => {
    it("formats valid timestamps in Vietnam local time and falls back on invalid inputs", () => {
      expect(formatSessionTimestamp("2026-11-20T04:15:00.000Z")).toBe(
        "11:15, 20/11/2026",
      );
      expect(formatSessionTimestamp("not-a-timestamp")).toBe("Không xác định");
      expect(formatSessionTimestamp(null)).toBe("Không xác định");
    });
  });
});
