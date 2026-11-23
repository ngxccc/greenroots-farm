import { describe, expect, it } from "bun:test";
import { formatViDate, formatVnd, getUserInitials } from "./format";

describe("Storefront Formatting Helpers", () => {
  describe("getUserInitials", () => {
    it("extracts uppercase initials for single-word, multi-word, and accented names", () => {
      expect(getUserInitials("Nguyễn Minh Anh")).toBe("MA");
      expect(getUserInitials("Trần   Thị   Khách")).toBe("TK");
      expect(getUserInitials("Đỗ Ánh")).toBe("ĐÁ");
      expect(getUserInitials("An")).toBe("A");
    });

    it("falls back to GR when full name is empty or whitespace-only", () => {
      expect(getUserInitials("")).toBe("GR");
      expect(getUserInitials("   ")).toBe("GR");
    });
  });

  describe("formatVnd and formatViDate", () => {
    it("formats integer VND amounts and Vietnam calendar dates", () => {
      expect(formatVnd(2450)).toBe("2.450đ");
      expect(formatViDate("2026-11-13T00:00:00.000Z")).toBe("13/11/2026");
      expect(formatViDate("not-a-date")).toBe("not-a-date");
    });
  });
});
