import { describe, expect, it } from "bun:test";
import { SubscriptionStatus } from "@greenroots/shared";
import {
  computeSubscriptionShippingTotalVnd,
  resolveSubscriptionPayosPanelPhase,
} from "./subscription-payos.utils";

describe("subscription-payos.utils", () => {
  describe("resolveSubscriptionPayosPanelPhase", () => {
    it("maps subscription statuses to pending, success, expired, and none", () => {
      expect(
        resolveSubscriptionPayosPanelPhase({
          status: SubscriptionStatus.PENDING_PAYMENT,
        }),
      ).toBe("pending");

      expect(
        resolveSubscriptionPayosPanelPhase({
          status: SubscriptionStatus.ACTIVE,
        }),
      ).toBe("success");

      expect(
        resolveSubscriptionPayosPanelPhase({
          status: SubscriptionStatus.CANCELLED,
        }),
      ).toBe("expired");

      expect(
        resolveSubscriptionPayosPanelPhase({
          status: SubscriptionStatus.PAUSED,
        }),
      ).toBe("none");

      expect(
        resolveSubscriptionPayosPanelPhase({
          status: SubscriptionStatus.COMPLETED,
        }),
      ).toBe("none");
    });
  });

  describe("computeSubscriptionShippingTotalVnd", () => {
    it("multiplies per-delivery shipping fee by total deliveries", () => {
      expect(
        computeSubscriptionShippingTotalVnd({
          shippingFeePerDeliveryVnd: 15_000,
          totalDeliveries: 4,
        }),
      ).toBe(60_000);

      expect(
        computeSubscriptionShippingTotalVnd({
          shippingFeePerDeliveryVnd: 0,
          totalDeliveries: 8,
        }),
      ).toBe(0);
    });
  });
});
