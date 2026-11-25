import { describe, expect, it } from "bun:test";
import { OrderStatus, PaymentMethod, PaymentStatus } from "@greenroots/shared";
import type { OrderDto } from "../schemas/order.schema";
import {
  buildOrderTimelineSteps,
  canReorderOrder,
  mapOrderItemsToCartEntries,
  ORDER_HISTORY_TABS,
  parseOrderHistorySearchParams,
  resolveStatusesQueryForTab,
  summarizeOrderItems,
} from "./order-history.utils";

const sampleOrder: OrderDto = {
  id: "019fa8bc-8f4d-7000-b366-e691f45cfb91",
  orderCode: "ORD-20261125-0001",
  orderStatus: OrderStatus.DELIVERED,
  paymentMethod: PaymentMethod.COD,
  paymentStatus: PaymentStatus.PAID,
  receiverName: "Nguyễn Minh Anh",
  receiverPhone: "0908412679",
  shippingAddress: "142 Lê Đức Thọ, Q. Gò Vấp, TP.HCM",
  shippingDistanceKm: 12.5,
  shippingFeeVnd: 15_000,
  subtotalVnd: 102_000,
  discountAmountVnd: 0,
  loyaltyPointsUsed: 0,
  totalAmountVnd: 117_000,
  items: [
    {
      id: "019fa8bc-8f4d-7000-b366-e691f45cfb92",
      productId: "019fa8bc-8f4d-7000-b366-e691f45cfb93",
      productName: "Cải xoăn Kale hữu cơ",
      productSlug: "cai-xoan-kale",
      productImageUrl: "https://res.cloudinary.com/demo/image/upload/kale.webp",
      unit: "250g",
      quantity: 1,
      unitPriceVnd: 42_000,
      lineTotalVnd: 42_000,
    },
    {
      id: "019fa8bc-8f4d-7000-b366-e691f45cfb94",
      productId: "019fa8bc-8f4d-7000-b366-e691f45cfb95",
      productName: "Cà rốt hữu cơ Đà Lạt",
      productSlug: "ca-rot-huu-co",
      productImageUrl: null,
      unit: "500g",
      quantity: 2,
      unitPriceVnd: 30_000,
      lineTotalVnd: 60_000,
    },
  ],
  createdAt: "2026-11-20T11:10:00.000Z",
  updatedAt: "2026-11-21T00:15:00.000Z",
};

describe("Order History Utils", () => {
  describe("ORDER_HISTORY_TABS", () => {
    it("covers all eight OrderStatus values across the four status filter tabs", () => {
      const groupedStatuses = ORDER_HISTORY_TABS.flatMap(
        (tab) => tab.statuses ?? [],
      );
      expect(new Set(groupedStatuses)).toEqual(
        new Set(Object.values(OrderStatus)),
      );
    });
  });

  describe("parseOrderHistorySearchParams", () => {
    it("normalizes unknown tab and invalid page values to safe defaults", () => {
      expect(
        parseOrderHistorySearchParams({ tab: "unknown", page: "-5" }),
      ).toEqual({
        tab: "all",
        page: 1,
      });

      expect(
        parseOrderHistorySearchParams({ tab: "pending", page: "3" }),
      ).toEqual({
        tab: "pending",
        page: 3,
      });
    });
  });

  describe("resolveStatusesQueryForTab", () => {
    it("returns undefined for all tab and comma-separated statuses for pending tab", () => {
      expect(resolveStatusesQueryForTab("all")).toBeUndefined();
      expect(resolveStatusesQueryForTab("pending")).toBe(
        "pending_payment,pending_confirmation,confirmed,packing",
      );
      expect(resolveStatusesQueryForTab("completed")).toBe(
        "delivered,completed",
      );
    });
  });

  describe("buildOrderTimelineSteps", () => {
    it("renders four progression steps without fabricating intermediate timestamps", () => {
      const steps = buildOrderTimelineSteps(
        OrderStatus.SHIPPING,
        sampleOrder.createdAt,
        sampleOrder.updatedAt,
      );

      expect(steps).toHaveLength(4);
      expect(steps[0]).toMatchObject({
        state: "completed",
        timestamp: sampleOrder.createdAt,
      });
      expect(steps[1]).toMatchObject({
        state: "completed",
        timestamp: undefined,
      });
      expect(steps[2]).toMatchObject({
        state: "current",
        timestamp: sampleOrder.updatedAt,
      });
      expect(steps[3]).toMatchObject({
        state: "upcoming",
        timestamp: undefined,
      });
    });

    it("renders cancelled branch when orderStatus is cancelled", () => {
      const steps = buildOrderTimelineSteps(
        OrderStatus.CANCELLED,
        sampleOrder.createdAt,
        sampleOrder.updatedAt,
      );

      expect(steps).toHaveLength(2);
      expect(steps[1]).toMatchObject({
        key: "cancelled",
        state: "cancelled",
        timestamp: sampleOrder.updatedAt,
      });
    });
  });

  describe("canReorderOrder", () => {
    it("allows reorder for retail delivered, completed, and cancelled orders while excluding subscription orders", () => {
      expect(canReorderOrder(sampleOrder)).toBe(true);
      expect(
        canReorderOrder({
          ...sampleOrder,
          orderStatus: OrderStatus.COMPLETED,
          paymentMethod: PaymentMethod.SUBSCRIPTION,
        }),
      ).toBe(false);
      expect(
        canReorderOrder({
          ...sampleOrder,
          orderStatus: OrderStatus.SHIPPING,
        }),
      ).toBe(false);
      expect(
        canReorderOrder({
          ...sampleOrder,
          items: [],
        }),
      ).toBe(false);
    });
  });

  describe("mapOrderItemsToCartEntries", () => {
    it("maps OrderDto items to StorefrontProduct cart entries with positive availableQuantity", () => {
      const entries = mapOrderItemsToCartEntries(sampleOrder.items);
      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({
        quantity: 1,
        product: {
          id: sampleOrder.items[0]?.productId,
          slug: "cai-xoan-kale",
          basePriceVnd: 42_000,
          availableQuantity: 999_999,
        },
      });
      expect(entries[1]?.product.imageUrl).toBeUndefined();
    });
  });

  describe("summarizeOrderItems", () => {
    it("summarizes up to two items and appends overflow count", () => {
      expect(summarizeOrderItems(sampleOrder.items)).toBe(
        "Cải xoăn Kale hữu cơ (250g) × 1, Cà rốt hữu cơ Đà Lạt (500g) × 2",
      );
      expect(
        summarizeOrderItems([
          ...sampleOrder.items,
          { ...sampleOrder.items[0], id: "3", productName: "Xà lách" },
        ]),
      ).toContain("và 1 sản phẩm khác");
    });
  });
});
