import { describe, expect, it } from "bun:test";
import { SubscriptionStatus } from "@greenroots/shared";
import type { SubscriptionDto } from "../schemas/subscription.schema";
import { resolveCustomerSubscriptionDetailSession } from "./subscriptions.server";

const SAMPLE_SUBSCRIPTION_ID = "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e22";

const SAMPLE_SUBSCRIPTION: SubscriptionDto = {
  id: SAMPLE_SUBSCRIPTION_ID,
  subscriptionCode: "SUB-20261127-XYZ123",
  planId: "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9f",
  planName: "Gói Rau Gia Đình 4 Tuần",
  priceVnd: 560_000,
  totalDeliveries: 4,
  weightPerDeliveryKg: 3,
  basketDescription: "Rau ăn lá và củ quả hữu cơ theo mùa",
  deliveryDay: "tuesday",
  remainingDeliveries: 4,
  status: SubscriptionStatus.PENDING_PAYMENT,
  receiverName: "Nguyễn Minh Anh",
  receiverPhone: "0908412679",
  shippingAddress: "142 Lê Đức Thọ, Gò Vấp, TP.HCM",
  shippingDistanceKm: 5.2,
  shippingFeePerDeliveryVnd: 0,
  totalAmountVnd: 560_000,
  startDate: "2026-12-01",
  endDate: "2026-12-22",
  paymentUrl: "https://mock.payos.local/checkout/987654321",
  reservationExpiresAt: "2026-11-27T10:15:00.000Z",
  createdAt: "2026-11-27T10:00:00.000Z",
  updatedAt: "2026-11-27T10:00:00.000Z",
};

describe("subscriptions.server", () => {
  describe("resolveCustomerSubscriptionDetailSession", () => {
    it("returns unauthenticated when access token is missing", async () => {
      const result = await resolveCustomerSubscriptionDetailSession(
        SAMPLE_SUBSCRIPTION_ID,
        {
          isDegraded: () => Promise.resolve(false),
          readToken: () => Promise.resolve(undefined),
        },
      );

      expect(result.status).toBe("unauthenticated");
    });

    it("returns degraded when auth gateway header is degraded", async () => {
      const result = await resolveCustomerSubscriptionDetailSession(
        SAMPLE_SUBSCRIPTION_ID,
        {
          isDegraded: () => Promise.resolve(true),
          readToken: () => Promise.resolve("token"),
        },
      );

      expect(result.status).toBe("degraded");
    });

    it("returns not_found without calling API when ID is not a UUID", async () => {
      let called = false;
      const result = await resolveCustomerSubscriptionDetailSession(
        "not-a-uuid",
        {
          isDegraded: () => Promise.resolve(false),
          readToken: () => Promise.resolve("token"),
          fetchMySubscriptionById: () => {
            called = true;
            return Promise.resolve({
              response: new Response(null, { status: 200 }),
            });
          },
        },
      );

      expect(called).toBe(false);
      expect(result.status).toBe("not_found");
    });

    it("returns missing state when API rejects subscription lookup", async () => {
      const result = await resolveCustomerSubscriptionDetailSession(
        SAMPLE_SUBSCRIPTION_ID,
        {
          isDegraded: () => Promise.resolve(false),
          readToken: () => Promise.resolve("token"),
          runWithRefresh: (op) => op(),
          fetchMySubscriptionById: () =>
            Promise.resolve({
              response: new Response(null, { status: 404 }),
            }),
        },
      );

      expect(result.status).toBe("not_found");
    });

    it("returns authenticated with subscription DTO when API succeeds", async () => {
      const result = await resolveCustomerSubscriptionDetailSession(
        SAMPLE_SUBSCRIPTION_ID,
        {
          isDegraded: () => Promise.resolve(false),
          readToken: () => Promise.resolve("token"),
          runWithRefresh: (op) => op(),
          fetchMySubscriptionById: () =>
            Promise.resolve({
              response: new Response(null, { status: 200 }),
              data: { data: SAMPLE_SUBSCRIPTION },
            }),
        },
      );

      expect(result.status).toBe("authenticated");
      if (result.status === "authenticated") {
        expect(result.subscription.subscriptionCode).toBe(
          "SUB-20261127-XYZ123",
        );
      }
    });
  });
});
