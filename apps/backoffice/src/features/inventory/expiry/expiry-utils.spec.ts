import { describe, expect, it } from "bun:test";
import { BatchStatus } from "@greenroots/shared";
import {
  computeRescuePriceVnd,
  evaluateFlashSaleEligibility,
  FLASH_SALE_DISCOUNT_MAX,
  FLASH_SALE_DISCOUNT_MIN,
  formatShelfLifeCountdown,
  validateFlashSaleDiscount,
} from "./expiry-utils";

describe("expiry-utils", () => {
  describe("formatShelfLifeCountdown", () => {
    it("returns expired state when remaining hours is zero or negative", () => {
      const zero = formatShelfLifeCountdown(0);
      const negative = formatShelfLifeCountdown(-2.5);

      expect(zero.urgency).toBe("expired");
      expect(zero.label).toBe("Đã hết hạn");
      expect(negative.urgency).toBe("expired");
    });

    it("formats sub-hour shelf life in minutes with critical urgency", () => {
      const result = formatShelfLifeCountdown(0.5);

      expect(result.urgency).toBe("critical");
      expect(result.label).toBe("Còn 30 phút");
    });

    it("formats hours and minutes with critical urgency when twelve hours or less remain", () => {
      const result = formatShelfLifeCountdown(8.5);

      expect(result.urgency).toBe("critical");
      expect(result.label).toBe("Còn 8g 30p");
    });

    it("formats hours with warning urgency between twelve and twenty-four hours", () => {
      const result = formatShelfLifeCountdown(18);

      expect(result.urgency).toBe("warning");
      expect(result.label).toBe("Còn 18 giờ");
    });

    it("formats hours with normal urgency when twenty-four hours or more remain", () => {
      const result = formatShelfLifeCountdown(36.4);

      expect(result.urgency).toBe("normal");
      expect(result.label).toBe("Còn 36 giờ");
    });
  });

  describe("evaluateFlashSaleEligibility", () => {
    it("allows enabling Flash Sale for in-stock non-expired batches", () => {
      const result = evaluateFlashSaleEligibility({
        availableQuantity: 15,
        hoursRemaining: 24,
        status: BatchStatus.NEAR_EXPIRY,
      });

      expect(result.eligible).toBe(true);
      expect(result.reason).toBeNull();
    });

    it("blocks enabling Flash Sale when batch is expired by remaining hours", () => {
      const result = evaluateFlashSaleEligibility({
        availableQuantity: 10,
        hoursRemaining: 0,
        status: BatchStatus.NEAR_EXPIRY,
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).not.toBeNull();
    });

    it("blocks enabling Flash Sale when batch status is expired", () => {
      const result = evaluateFlashSaleEligibility({
        availableQuantity: 10,
        hoursRemaining: 5,
        status: BatchStatus.EXPIRED,
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).not.toBeNull();
    });

    it("blocks enabling Flash Sale when available quantity is zero", () => {
      const result = evaluateFlashSaleEligibility({
        availableQuantity: 0,
        hoursRemaining: 12,
        status: BatchStatus.IN_STOCK,
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).not.toBeNull();
    });

    it("blocks enabling Flash Sale when batch status is sold_out", () => {
      const result = evaluateFlashSaleEligibility({
        availableQuantity: 3,
        hoursRemaining: 12,
        status: BatchStatus.SOLD_OUT,
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).not.toBeNull();
    });
  });

  describe("validateFlashSaleDiscount", () => {
    it("accepts integer discount percentages within allowed bounds", () => {
      expect(validateFlashSaleDiscount(FLASH_SALE_DISCOUNT_MIN)).toEqual({
        valid: true,
        value: 1,
      });
      expect(validateFlashSaleDiscount("50")).toEqual({
        valid: true,
        value: 50,
      });
      expect(validateFlashSaleDiscount(FLASH_SALE_DISCOUNT_MAX)).toEqual({
        valid: true,
        value: 90,
      });
    });

    it("rejects empty or non-integer discount inputs", () => {
      expect(validateFlashSaleDiscount("").valid).toBe(false);
      expect(validateFlashSaleDiscount("abc").valid).toBe(false);
      expect(validateFlashSaleDiscount("12.5").valid).toBe(false);
    });

    it("rejects discount percentages outside the 1 to 90 range", () => {
      expect(validateFlashSaleDiscount(0).valid).toBe(false);
      expect(validateFlashSaleDiscount(-10).valid).toBe(false);
      expect(validateFlashSaleDiscount(91).valid).toBe(false);
    });
  });

  describe("computeRescuePriceVnd", () => {
    it("computes rounded rescue price from base price and discount percentage", () => {
      expect(computeRescuePriceVnd(40_000, 50)).toBe(20_000);
      expect(computeRescuePriceVnd(35_000, 33)).toBe(23_450);
    });
  });
});
