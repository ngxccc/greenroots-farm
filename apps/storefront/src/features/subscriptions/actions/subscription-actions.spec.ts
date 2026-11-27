import { describe, expect, it } from "bun:test";
import {
  API_ERROR_CODES,
  DeliveryDay,
  SubscriptionStatus,
} from "@greenroots/shared";
import type { SubscriptionDto } from "../schemas/subscription.schema";
import {
  executeCancelSubscriptionAction,
  executeConfirmMockSubscriptionPayosAction,
  executeCreateSubscriptionCheckoutAction,
  executeGetSubscriptionAction,
} from "./subscription-actions.impl";

const SAMPLE_PLAN_ID = "0195a8f0-0001-7000-8000-000000000101";
const SAMPLE_ADDRESS_ID = "0195a8f0-0001-7000-8000-000000000201";
const SAMPLE_IDEMPOTENCY_KEY = "0195a8f0-0001-7000-8000-000000000301";
const SAMPLE_SUBSCRIPTION_ID = "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e22";

function buildSampleSubscription(
  overrides?: Partial<SubscriptionDto>,
): SubscriptionDto {
  return {
    id: SAMPLE_SUBSCRIPTION_ID,
    subscriptionCode: "SUB-20261127-XYZ123",
    planId: SAMPLE_PLAN_ID,
    planName: "Gói Rau Gia Đình 4 Tuần",
    priceVnd: 560_000,
    totalDeliveries: 4,
    weightPerDeliveryKg: 3,
    basketDescription: "Rau ăn lá và củ quả hữu cơ theo mùa",
    deliveryDay: DeliveryDay.TUESDAY,
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
    ...overrides,
  };
}

describe("subscription-actions", () => {
  describe("executeCreateSubscriptionCheckoutAction", () => {
    it("rejects non-UUID Idempotency-Key locally without calling API", async () => {
      let called = false;
      const result = await executeCreateSubscriptionCheckoutAction(
        {
          idempotencyKey: "not-a-uuid",
          planId: SAMPLE_PLAN_ID,
          addressId: SAMPLE_ADDRESS_ID,
          deliveryDay: DeliveryDay.BOTH,
        },
        {
          postSubscriptionCheckout: () => {
            called = true;
            return Promise.resolve({
              response: new Response(null, { status: 201 }),
            });
          },
        },
      );

      expect(called).toBe(false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
        expect(result.sessionInvalidated).toBe(false);
      }
    });

    it("forwards Idempotency-Key header and returns created subscription after refresh retry", async () => {
      let capturedKey = "";
      let capturedBody: unknown = null;
      let attempts = 0;
      const sample = buildSampleSubscription({ deliveryDay: DeliveryDay.BOTH });

      const result = await executeCreateSubscriptionCheckoutAction(
        {
          idempotencyKey: SAMPLE_IDEMPOTENCY_KEY,
          planId: SAMPLE_PLAN_ID,
          addressId: SAMPLE_ADDRESS_ID,
          deliveryDay: DeliveryDay.BOTH,
        },
        {
          runWithRefresh: async (op) => {
            const first = await op();
            if (first.response.status === 401) {
              return op();
            }
            return first;
          },
          postSubscriptionCheckout: (key, body) => {
            capturedKey = key;
            capturedBody = body;
            attempts += 1;
            if (attempts === 1) {
              return Promise.resolve({
                response: new Response(null, { status: 401 }),
              });
            }
            return Promise.resolve({
              response: new Response(null, { status: 201 }),
              data: { data: sample },
            });
          },
        },
      );

      expect(capturedKey).toBe(SAMPLE_IDEMPOTENCY_KEY);
      expect(capturedBody).toEqual({
        planId: SAMPLE_PLAN_ID,
        addressId: SAMPLE_ADDRESS_ID,
        deliveryDay: DeliveryDay.BOTH,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.subscription.id).toBe(SAMPLE_SUBSCRIPTION_ID);
        expect(result.subscription.paymentUrl).toBe(
          "https://mock.payos.local/checkout/987654321",
        );
      }
    });

    it("maps RFC 9457 subscription business errors without invalidating session", async () => {
      const codes = [
        API_ERROR_CODES.SUBSCRIPTION_PENDING_LIMIT_REACHED,
        API_ERROR_CODES.SUBSCRIPTION_PAYOS_DISABLED,
        API_ERROR_CODES.SUBSCRIPTION_PLAN_INACTIVE,
        API_ERROR_CODES.OUT_OF_DELIVERY_RADIUS,
      ] as const;

      for (const code of codes) {
        const result = await executeCreateSubscriptionCheckoutAction(
          {
            idempotencyKey: SAMPLE_IDEMPOTENCY_KEY,
            planId: SAMPLE_PLAN_ID,
            addressId: SAMPLE_ADDRESS_ID,
            deliveryDay: DeliveryDay.TUESDAY,
          },
          {
            runWithRefresh: (op) => op(),
            postSubscriptionCheckout: () =>
              Promise.resolve({
                response: new Response(null, { status: 422 }),
                error: {
                  code,
                  detail: `Error: ${code}`,
                },
              }),
          },
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.sessionInvalidated).toBe(false);
          expect(result.code).toBe(code);
        }
      }
    });

    it("clears cookies and flags sessionInvalidated when 401 persists after refresh", async () => {
      let cleared = false;
      const result = await executeCreateSubscriptionCheckoutAction(
        {
          idempotencyKey: SAMPLE_IDEMPOTENCY_KEY,
          planId: SAMPLE_PLAN_ID,
          addressId: SAMPLE_ADDRESS_ID,
          deliveryDay: DeliveryDay.FRIDAY,
        },
        {
          runWithRefresh: (op) => op(),
          clearCookies: () => {
            cleared = true;
            return Promise.resolve();
          },
          postSubscriptionCheckout: () =>
            Promise.resolve({
              response: new Response(null, { status: 401 }),
              error: {
                code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
                detail: "Unauthorized",
              },
            }),
        },
      );

      expect(cleared).toBe(true);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.sessionInvalidated).toBe(true);
        expect(result.code).toBe(API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED);
      }
    });
  });

  describe("executeGetSubscriptionAction", () => {
    it("rejects non-UUID subscription ID locally without calling API", async () => {
      let called = false;
      const result = await executeGetSubscriptionAction("not-a-uuid", {
        getSubscriptionById: () => {
          called = true;
          return Promise.resolve({
            response: new Response(null, { status: 200 }),
          });
        },
      });

      expect(called).toBe(false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
        expect(result.sessionInvalidated).toBe(false);
      }
    });

    it("returns subscription detail when API succeeds", async () => {
      const sample = buildSampleSubscription();
      const result = await executeGetSubscriptionAction(
        SAMPLE_SUBSCRIPTION_ID,
        {
          runWithRefresh: (op) => op(),
          getSubscriptionById: () =>
            Promise.resolve({
              response: new Response(null, { status: 200 }),
              data: { data: sample },
            }),
        },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.subscription.id).toBe(SAMPLE_SUBSCRIPTION_ID);
        expect(result.subscription.status).toBe(
          SubscriptionStatus.PENDING_PAYMENT,
        );
      }
    });

    it("clears cookies and flags sessionInvalidated when session is rejected", async () => {
      let cleared = false;
      const result = await executeGetSubscriptionAction(
        SAMPLE_SUBSCRIPTION_ID,
        {
          runWithRefresh: (op) => op(),
          clearCookies: () => {
            cleared = true;
            return Promise.resolve();
          },
          getSubscriptionById: () =>
            Promise.resolve({
              response: new Response(null, { status: 401 }),
              error: {
                code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
                detail: "Unauthorized",
              },
            }),
        },
      );

      expect(cleared).toBe(true);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.sessionInvalidated).toBe(true);
        expect(result.code).toBe(API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED);
      }
    });

    it("preserves cookies and reports service outage on transient refresh failure", async () => {
      let cleared = false;
      const result = await executeGetSubscriptionAction(
        SAMPLE_SUBSCRIPTION_ID,
        {
          runWithRefresh: () =>
            Promise.resolve({
              response: new Response(null, { status: 401 }),
              refreshOutcome: "transient_error",
            }),
          clearCookies: () => {
            cleared = true;
            return Promise.resolve();
          },
        },
      );

      expect(cleared).toBe(false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.sessionInvalidated).toBe(false);
        expect(result.code).toBe(API_ERROR_CODES.SERVICE_UNAVAILABLE);
      }
    });
  });

  describe("executeCancelSubscriptionAction", () => {
    it("rejects non-UUID subscription ID locally without calling API", async () => {
      let called = false;
      const result = await executeCancelSubscriptionAction("invalid-id", {
        cancelSubscriptionById: () => {
          called = true;
          return Promise.resolve({
            response: new Response(null, { status: 200 }),
          });
        },
      });

      expect(called).toBe(false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
      }
    });

    // Invariant: INV-SF04-5
    it("cancels pending subscription and returns updated cancelled DTO", async () => {
      const cancelled = buildSampleSubscription({
        status: SubscriptionStatus.CANCELLED,
        reservationExpiresAt: null,
      });

      const result = await executeCancelSubscriptionAction(
        SAMPLE_SUBSCRIPTION_ID,
        {
          runWithRefresh: (op) => op(),
          cancelSubscriptionById: () =>
            Promise.resolve({
              response: new Response(null, { status: 200 }),
              data: { data: cancelled },
            }),
        },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.subscription.status).toBe(SubscriptionStatus.CANCELLED);
        expect(result.subscription.reservationExpiresAt).toBeNull();
      }
    });
  });

  describe("executeConfirmMockSubscriptionPayosAction", () => {
    it("fails closed in production without calling webhook API", async () => {
      let called = false;
      const result = await executeConfirmMockSubscriptionPayosAction(
        {
          subscriptionId: SAMPLE_SUBSCRIPTION_ID,
          paymentUrl: "https://mock.payos.local/checkout/987654321",
          amountVnd: 560_000,
          subscriptionCode: "SUB-20261127-XYZ123",
        },
        {
          nodeEnv: "production",
          postMockWebhook: () => {
            called = true;
            return Promise.resolve({
              response: new Response(null, { status: 200 }),
            });
          },
        },
      );

      expect(called).toBe(false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(API_ERROR_CODES.FORBIDDEN);
      }
    });

    it("rejects non-mock payment URLs before calling webhook API", async () => {
      let called = false;
      const result = await executeConfirmMockSubscriptionPayosAction(
        {
          subscriptionId: SAMPLE_SUBSCRIPTION_ID,
          paymentUrl: "https://pay.payos.vn/web/abc123",
          amountVnd: 560_000,
          subscriptionCode: "SUB-20261127-XYZ123",
        },
        {
          nodeEnv: "development",
          postMockWebhook: () => {
            called = true;
            return Promise.resolve({
              response: new Response(null, { status: 200 }),
            });
          },
        },
      );

      expect(called).toBe(false);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
      }
    });

    it("forwards signed mock webhook payload in non-production", async () => {
      let capturedOrderCode = 0;
      let capturedDescription = "";
      const result = await executeConfirmMockSubscriptionPayosAction(
        {
          subscriptionId: SAMPLE_SUBSCRIPTION_ID,
          paymentUrl: "https://mock.payos.local/checkout/987654321",
          amountVnd: 560_000,
          subscriptionCode: "SUB-20261127-XYZ123",
        },
        {
          nodeEnv: "test",
          postMockWebhook: (payload) => {
            capturedOrderCode = Number(payload.data.orderCode);
            capturedDescription = String(payload.data.description);
            return Promise.resolve({
              response: new Response(null, { status: 200 }),
              data: { data: { received: true } },
            });
          },
        },
      );

      expect(capturedOrderCode).toBe(987654321);
      expect(capturedDescription).toBe("SUB-20261127-XYZ123");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.received).toBe(true);
      }
    });
  });
});
