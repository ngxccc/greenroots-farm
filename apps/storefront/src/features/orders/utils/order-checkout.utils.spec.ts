import { describe, expect, it } from "bun:test";
import { BUSINESS_RULES } from "@greenroots/shared";
import type { CartItem } from "@/stores/cart.store";
import type { ValidateCartResponse } from "../schemas/order.schema";
import {
  buildCheckoutPayloadSignature,
  calculateMovProgress,
  clampLoyaltyPoints,
  reconcileValidatedCart,
} from "./order-checkout.utils";

describe("order-checkout.utils", () => {
  describe("buildCheckoutPayloadSignature", () => {
    it("produces identical signatures regardless of item order or duplicate lines", () => {
      const sigA = buildCheckoutPayloadSignature({
        items: [
          { productId: "b", quantity: 1 },
          { productId: "a", quantity: 0.5 },
          { productId: "a", quantity: 0.5 },
        ],
        addressId: "addr-1",
        loyaltyPoints: 1000,
      });

      const sigB = buildCheckoutPayloadSignature({
        items: [
          { productId: "a", quantity: 1 },
          { productId: "b", quantity: 1 },
        ],
        addressId: "addr-1",
        loyaltyPoints: 1000,
      });

      expect(sigA).toBe(sigB);
    });

    it("changes signature when addressId or loyaltyPoints changes", () => {
      const base = buildCheckoutPayloadSignature({
        items: [{ productId: "a", quantity: 2 }],
        addressId: "addr-1",
        loyaltyPoints: 0,
      });

      const diffAddress = buildCheckoutPayloadSignature({
        items: [{ productId: "a", quantity: 2 }],
        addressId: "addr-2",
        loyaltyPoints: 0,
      });

      const diffPoints = buildCheckoutPayloadSignature({
        items: [{ productId: "a", quantity: 2 }],
        addressId: "addr-1",
        loyaltyPoints: 500,
      });

      expect(base).not.toBe(diffAddress);
      expect(base).not.toBe(diffPoints);
    });
  });

  describe("clampLoyaltyPoints", () => {
    it("caps requested points at the minimum of balance and subtotal", () => {
      // Invariant: INV-ORD-4
      expect(clampLoyaltyPoints(100_000, 60_000, 80_000)).toBe(60_000);
      expect(clampLoyaltyPoints(100_000, 90_000, 50_000)).toBe(50_000);
      expect(clampLoyaltyPoints(-10, 50_000, 80_000)).toBe(0);
      expect(clampLoyaltyPoints(12_345.9, 50_000, 80_000)).toBe(12_345);
    });
  });

  describe("calculateMovProgress", () => {
    it("computes remaining VND and progress percentage against BUSINESS_RULES.MIN_ORDER_VALUE_VND", () => {
      const mov = BUSINESS_RULES.MIN_ORDER_VALUE_VND;
      const half = calculateMovProgress(Math.floor(mov / 2));
      expect(half.meetsMinOrderValue).toBe(false);
      expect(half.remainingVnd).toBe(mov - Math.floor(mov / 2));
      expect(half.progressPercent).toBe(50);

      const exact = calculateMovProgress(mov);
      expect(exact.meetsMinOrderValue).toBe(true);
      expect(exact.remainingVnd).toBe(0);
      expect(exact.progressPercent).toBe(100);
    });
  });

  describe("reconcileValidatedCart", () => {
    it("identifies price drift and blocking stock issues separately", () => {
      const localItems: CartItem[] = [
        {
          productId: "p-1",
          slug: "cai-xanh",
          name: "Cải xanh",
          unitLabel: "500g",
          unitPriceVnd: 20_000,
          availableQuantity: 5,
          quantity: 2,
        },
        {
          productId: "p-2",
          slug: "ca-chua",
          name: "Cà chua",
          unitLabel: "500g",
          unitPriceVnd: 30_000,
          availableQuantity: 5,
          quantity: 4,
        },
      ];

      const response: ValidateCartResponse = {
        isValid: false,
        meetsMinOrderValue: true,
        minOrderValueVnd: BUSINESS_RULES.MIN_ORDER_VALUE_VND,
        items: [
          {
            productId: "p-1",
            name: "Cải xanh",
            slug: "cai-xanh",
            unit: "500g",
            requestedQuantity: 2,
            availableQuantity: 5,
            unitPriceVnd: 22_000,
            lineTotalVnd: 44_000,
            isAvailable: true,
            issue: null,
          },
          {
            productId: "p-2",
            name: "Cà chua",
            slug: "ca-chua",
            unit: "500g",
            requestedQuantity: 4,
            availableQuantity: 2,
            unitPriceVnd: 30_000,
            lineTotalVnd: 120_000,
            isAvailable: false,
            issue: "INSUFFICIENT_STOCK",
          },
        ],
        subtotalVnd: 164_000,
        shipping: null,
        requestedLoyaltyPoints: 0,
        appliedLoyaltyPoints: 0,
        availableLoyaltyPoints: 0,
        discountAmountVnd: 0,
        totalAmountVnd: 164_000,
      };

      const reconciled = reconcileValidatedCart(localItems, response);
      expect(reconciled.priceChangedProductIds).toEqual(["p-1"]);
      expect(reconciled.hasBlockingItemIssues).toBe(true);
      expect(reconciled.issueItems.map((i) => i.productId)).toEqual(["p-2"]);
    });
  });
});
