import { describe, expect, it } from "bun:test";
import { API_ERROR_CODES, BUSINESS_RULES } from "@greenroots/shared";
import type { OrderDto, ValidateCartResponse } from "../schemas/order.schema";
import {
  executeCheckoutCodAction,
  executeValidateCartAction,
} from "./order-actions";

const SAMPLE_PRODUCT_ID = "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9f";
const SAMPLE_ADDRESS_ID = "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e00";
const SAMPLE_IDEMPOTENCY_KEY = "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e11";

describe("order-actions", () => {
  describe("executeValidateCartAction", () => {
    it("rejects empty cart locally without calling API", async () => {
      let called = false;
      const result = await executeValidateCartAction(
        { items: [] },
        {
          postValidateCart: () => {
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
        expect(result.sessionInvalidated).toBe(false);
      }
    });

    it("rejects quantities exceeding two decimal places before calling API", async () => {
      let called = false;
      const result = await executeValidateCartAction(
        { items: [{ productId: SAMPLE_PRODUCT_ID, quantity: 1.234 }] },
        {
          postValidateCart: () => {
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

    it("returns server-authoritative validation data on success", async () => {
      const mockResponse: ValidateCartResponse = {
        isValid: true,
        meetsMinOrderValue: true,
        minOrderValueVnd: BUSINESS_RULES.MIN_ORDER_VALUE_VND,
        items: [],
        subtotalVnd: 80_000,
        shipping: null,
        requestedLoyaltyPoints: 0,
        appliedLoyaltyPoints: 0,
        availableLoyaltyPoints: 5000,
        discountAmountVnd: 0,
        totalAmountVnd: 80_000,
      };

      const result = await executeValidateCartAction(
        {
          items: [{ productId: SAMPLE_PRODUCT_ID, quantity: 2 }],
          addressId: SAMPLE_ADDRESS_ID,
        },
        {
          runWithRefresh: (op) => op(),
          postValidateCart: () =>
            Promise.resolve({
              response: new Response(null, { status: 200 }),
              data: { data: mockResponse },
            }),
        },
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.subtotalVnd).toBe(80_000);
        expect(result.data.availableLoyaltyPoints).toBe(5000);
      }
    });

    it("clears cookies and flags sessionInvalidated when session is rejected", async () => {
      let cleared = false;
      const result = await executeValidateCartAction(
        { items: [{ productId: SAMPLE_PRODUCT_ID, quantity: 1 }] },
        {
          runWithRefresh: (op) => op(),
          clearCookies: () => {
            cleared = true;
            return Promise.resolve();
          },
          postValidateCart: () =>
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
      const result = await executeValidateCartAction(
        { items: [{ productId: SAMPLE_PRODUCT_ID, quantity: 1 }] },
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

  describe("executeCheckoutCodAction", () => {
    it("rejects non-UUID Idempotency-Key before calling API", async () => {
      let called = false;
      const result = await executeCheckoutCodAction(
        {
          idempotencyKey: "not-a-uuid",
          items: [{ productId: SAMPLE_PRODUCT_ID, quantity: 1 }],
        },
        {
          postCheckout: () => {
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
      }
    });

    it("forwards Idempotency-Key header and returns created order after refresh retry", async () => {
      let capturedKey = "";
      let attempts = 0;
      const mockOrder: OrderDto = {
        id: "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e22",
        orderCode: "ORD-20261124-ABC123",
        orderStatus: "pending_confirmation",
        paymentMethod: "cod",
        paymentStatus: "pending",
        receiverName: "Nguyễn Minh Anh",
        receiverPhone: "0908412679",
        shippingAddress: "142 Lê Đức Thọ, Gò Vấp, TP.HCM",
        shippingDistanceKm: 5.2,
        shippingFeeVnd: 26_000,
        subtotalVnd: 80_000,
        discountAmountVnd: 5_000,
        loyaltyPointsUsed: 5_000,
        totalAmountVnd: 101_000,
        items: [],
        createdAt: "2026-11-24T14:00:00.000Z",
        updatedAt: "2026-11-24T14:00:00.000Z",
      };

      const result = await executeCheckoutCodAction(
        {
          idempotencyKey: SAMPLE_IDEMPOTENCY_KEY,
          items: [{ productId: SAMPLE_PRODUCT_ID, quantity: 2 }],
          addressId: SAMPLE_ADDRESS_ID,
          loyaltyPoints: 5_000,
        },
        {
          runWithRefresh: async (op) => {
            const first = await op();
            if (first.response.status === 401) {
              return op();
            }
            return first;
          },
          postCheckout: (key) => {
            capturedKey = key;
            attempts += 1;
            if (attempts === 1) {
              return Promise.resolve({
                response: new Response(null, { status: 401 }),
              });
            }
            return Promise.resolve({
              response: new Response(null, { status: 201 }),
              data: { data: mockOrder },
            });
          },
        },
      );

      expect(capturedKey).toBe(SAMPLE_IDEMPOTENCY_KEY);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.order.orderCode).toBe("ORD-20261124-ABC123");
        expect(result.order.totalAmountVnd).toBe(101_000);
      }
    });

    it("maps business rule failures and preserves invalidParams without invalidating session", async () => {
      const result = await executeCheckoutCodAction(
        {
          idempotencyKey: SAMPLE_IDEMPOTENCY_KEY,
          items: [{ productId: SAMPLE_PRODUCT_ID, quantity: 1 }],
        },
        {
          runWithRefresh: (op) => op(),
          postCheckout: () =>
            Promise.resolve({
              response: new Response(null, { status: 422 }),
              error: {
                code: API_ERROR_CODES.ORDER_BELOW_MINIMUM_VALUE,
                detail: "Below MOV",
                invalidParams: [
                  { name: "subtotalVnd", reason: "Must be >= 50000" },
                ],
              },
            }),
        },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.sessionInvalidated).toBe(false);
        expect(result.code).toBe(API_ERROR_CODES.ORDER_BELOW_MINIMUM_VALUE);
        expect(result.invalidParams).toEqual([
          { name: "subtotalVnd", reason: "Must be >= 50000" },
        ]);
      }
    });

    it("maps stock conflict and service unavailability failures accurately", async () => {
      const conflictResult = await executeCheckoutCodAction(
        {
          idempotencyKey: SAMPLE_IDEMPOTENCY_KEY,
          items: [{ productId: SAMPLE_PRODUCT_ID, quantity: 10 }],
        },
        {
          runWithRefresh: (op) => op(),
          postCheckout: () =>
            Promise.resolve({
              response: new Response(null, { status: 409 }),
              error: {
                code: API_ERROR_CODES.INSUFFICIENT_STOCK,
                detail: "Insufficient stock",
              },
            }),
        },
      );

      expect(conflictResult.ok).toBe(false);
      if (!conflictResult.ok) {
        expect(conflictResult.code).toBe(API_ERROR_CODES.INSUFFICIENT_STOCK);
      }

      const unavailableResult = await executeCheckoutCodAction(
        {
          idempotencyKey: SAMPLE_IDEMPOTENCY_KEY,
          items: [{ productId: SAMPLE_PRODUCT_ID, quantity: 1 }],
        },
        {
          runWithRefresh: (op) => op(),
          postCheckout: () =>
            Promise.resolve({
              response: new Response(null, { status: 503 }),
              error: {
                code: API_ERROR_CODES.SERVICE_UNAVAILABLE,
                detail: "Redis down",
              },
            }),
        },
      );

      expect(unavailableResult.ok).toBe(false);
      if (!unavailableResult.ok) {
        expect(unavailableResult.code).toBe(
          API_ERROR_CODES.SERVICE_UNAVAILABLE,
        );
      }
    });
  });
});
