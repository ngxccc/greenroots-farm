import { describe, expect, it } from "bun:test";
import { OrderStatus, PaymentMethod, PaymentStatus } from "@greenroots/shared";
import {
  computeRemainingSeconds,
  formatCountdownMmSs,
  parseMockPayosOrderCode,
  resolvePayosPanelPhase,
} from "./payos-payment.utils";

describe("payos-payment.utils", () => {
  describe("parseMockPayosOrderCode", () => {
    it("extracts positive integer orderCode from mock.payos.local checkout URL", () => {
      expect(
        parseMockPayosOrderCode("https://mock.payos.local/checkout/123456789"),
      ).toBe(123456789);
    });

    it("returns null for production PayOS URLs, invalid paths, or non-https schemes", () => {
      expect(
        parseMockPayosOrderCode("https://pay.payos.vn/web/abc123"),
      ).toBeNull();
      expect(
        parseMockPayosOrderCode("http://mock.payos.local/checkout/123456"),
      ).toBeNull();
      expect(
        parseMockPayosOrderCode("https://mock.payos.local/checkout/0"),
      ).toBeNull();
      expect(
        parseMockPayosOrderCode("https://mock.payos.local/other/123"),
      ).toBeNull();
      expect(parseMockPayosOrderCode(null)).toBeNull();
    });
  });

  describe("computeRemainingSeconds", () => {
    it("computes remaining seconds from reservationExpiresAt and clamps past timestamps to zero", () => {
      const nowMs = Date.parse("2026-11-27T10:00:00.000Z");
      expect(computeRemainingSeconds("2026-11-27T10:15:00.000Z", nowMs)).toBe(
        900,
      );
      expect(computeRemainingSeconds("2026-11-27T09:59:00.000Z", nowMs)).toBe(
        0,
      );
      expect(computeRemainingSeconds(null, nowMs)).toBe(0);
      expect(computeRemainingSeconds("not-a-date", nowMs)).toBe(0);
    });
  });

  describe("formatCountdownMmSs", () => {
    it("formats remaining seconds as zero-padded MM:SS", () => {
      expect(formatCountdownMmSs(899)).toBe("14:59");
      expect(formatCountdownMmSs(65)).toBe("01:05");
      expect(formatCountdownMmSs(0)).toBe("00:00");
      expect(formatCountdownMmSs(-10)).toBe("00:00");
    });
  });

  describe("resolvePayosPanelPhase", () => {
    it("maps PayOS order statuses to pending, success, expired, and none for COD", () => {
      expect(
        resolvePayosPanelPhase({
          paymentMethod: PaymentMethod.COD,
          orderStatus: OrderStatus.PENDING_CONFIRMATION,
          paymentStatus: PaymentStatus.PENDING,
        }),
      ).toBe("none");

      expect(
        resolvePayosPanelPhase({
          paymentMethod: PaymentMethod.PAYOS,
          orderStatus: OrderStatus.PENDING_PAYMENT,
          paymentStatus: PaymentStatus.PENDING,
        }),
      ).toBe("pending");

      expect(
        resolvePayosPanelPhase({
          paymentMethod: PaymentMethod.PAYOS,
          orderStatus: OrderStatus.CONFIRMED,
          paymentStatus: PaymentStatus.PAID,
        }),
      ).toBe("success");

      expect(
        resolvePayosPanelPhase({
          paymentMethod: PaymentMethod.PAYOS,
          orderStatus: OrderStatus.CANCELLED,
          paymentStatus: PaymentStatus.CANCELLED,
        }),
      ).toBe("expired");
    });
  });
});
