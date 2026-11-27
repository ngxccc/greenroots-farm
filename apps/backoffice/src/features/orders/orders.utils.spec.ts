import { describe, expect, it } from "bun:test";
import {
  BatchStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  UserRole,
} from "@greenroots/shared";
import {
  canCancelOrder,
  canConfirmOrderFefo,
  canManageOrderFulfillment,
  canTransitionOrderStatus,
  doesCancellationReleaseStock,
  getActiveAllocations,
  getDeliveryScheduleCue,
  getNextForwardActionLabel,
  getNextForwardStatus,
  getOrderCodDisplay,
  groupPickListByBatch,
  isPickListEligible,
  isSubscriptionOrder,
  type OrderPickListDto,
} from "./orders.utils";

describe("orders.utils", () => {
  describe("OrderStatus FSM", () => {
    it("allows FEFO confirmation only for pending_confirmation orders", () => {
      expect(canConfirmOrderFefo(OrderStatus.PENDING_CONFIRMATION)).toBe(true);
      expect(canConfirmOrderFefo(OrderStatus.PENDING_PAYMENT)).toBe(false);
      expect(canConfirmOrderFefo(OrderStatus.CONFIRMED)).toBe(false);
      expect(canConfirmOrderFefo(OrderStatus.PACKING)).toBe(false);
      expect(canConfirmOrderFefo(OrderStatus.CANCELLED)).toBe(false);
    });

    it("advances confirmed orders linearly through packing, shipping, delivered, and completed", () => {
      expect(getNextForwardStatus(OrderStatus.CONFIRMED)).toBe(
        OrderStatus.PACKING,
      );
      expect(getNextForwardStatus(OrderStatus.PACKING)).toBe(
        OrderStatus.SHIPPING,
      );
      expect(getNextForwardStatus(OrderStatus.SHIPPING)).toBe(
        OrderStatus.DELIVERED,
      );
      expect(getNextForwardStatus(OrderStatus.DELIVERED)).toBe(
        OrderStatus.COMPLETED,
      );
      expect(getNextForwardStatus(OrderStatus.COMPLETED)).toBeNull();
      expect(getNextForwardStatus(OrderStatus.CANCELLED)).toBeNull();
      expect(getNextForwardStatus(OrderStatus.PENDING_CONFIRMATION)).toBeNull();
    });

    it("provides Vietnamese action labels for each forward transition", () => {
      expect(getNextForwardActionLabel(OrderStatus.CONFIRMED)).toBe("Đóng gói");
      expect(getNextForwardActionLabel(OrderStatus.PACKING)).toBe("Xuất giao");
      expect(getNextForwardActionLabel(OrderStatus.SHIPPING)).toBe("Đã giao");
      expect(getNextForwardActionLabel(OrderStatus.DELIVERED)).toBe("Hoàn tất");
      expect(getNextForwardActionLabel(OrderStatus.COMPLETED)).toBeNull();
    });

    it("rejects direct transition into confirmed or backward FSM transitions", () => {
      expect(
        canTransitionOrderStatus(
          OrderStatus.PENDING_CONFIRMATION,
          OrderStatus.CONFIRMED,
        ),
      ).toBe(false);
      expect(
        canTransitionOrderStatus(OrderStatus.PACKING, OrderStatus.CONFIRMED),
      ).toBe(false);
      expect(
        canTransitionOrderStatus(OrderStatus.SHIPPING, OrderStatus.CANCELLED),
      ).toBe(false);
      expect(
        canTransitionOrderStatus(OrderStatus.COMPLETED, OrderStatus.CANCELLED),
      ).toBe(false);
    });

    it("permits cancellation only before shipping and identifies stock-releasing states", () => {
      expect(canCancelOrder(OrderStatus.PENDING_PAYMENT)).toBe(true);
      expect(canCancelOrder(OrderStatus.PENDING_CONFIRMATION)).toBe(true);
      expect(canCancelOrder(OrderStatus.CONFIRMED)).toBe(true);
      expect(canCancelOrder(OrderStatus.PACKING)).toBe(true);
      expect(canCancelOrder(OrderStatus.SHIPPING)).toBe(false);
      expect(canCancelOrder(OrderStatus.DELIVERED)).toBe(false);
      expect(canCancelOrder(OrderStatus.COMPLETED)).toBe(false);
      expect(canCancelOrder(OrderStatus.CANCELLED)).toBe(false);

      expect(doesCancellationReleaseStock(OrderStatus.CONFIRMED)).toBe(true);
      expect(doesCancellationReleaseStock(OrderStatus.PACKING)).toBe(true);
      expect(doesCancellationReleaseStock(OrderStatus.SHIPPING)).toBe(false);
    });
  });

  describe("canManageOrderFulfillment", () => {
    it("allows sales, admin, and super_admin roles", () => {
      expect(canManageOrderFulfillment(UserRole.SALES)).toBe(true);
      expect(canManageOrderFulfillment(UserRole.ADMIN)).toBe(true);
      expect(canManageOrderFulfillment(UserRole.SUPER_ADMIN)).toBe(true);
    });

    it("blocks farm_staff, customer, guest, and missing roles", () => {
      expect(canManageOrderFulfillment(UserRole.FARM_STAFF)).toBe(false);
      expect(canManageOrderFulfillment(UserRole.CUSTOMER)).toBe(false);
      expect(canManageOrderFulfillment(UserRole.GUEST)).toBe(false);
      expect(canManageOrderFulfillment(null)).toBe(false);
      expect(canManageOrderFulfillment(undefined)).toBe(false);
    });
  });

  describe("isPickListEligible and groupPickListByBatch", () => {
    it("allows pick list only for confirmed, packing, and shipping statuses", () => {
      expect(isPickListEligible(OrderStatus.CONFIRMED)).toBe(true);
      expect(isPickListEligible(OrderStatus.PACKING)).toBe(true);
      expect(isPickListEligible(OrderStatus.SHIPPING)).toBe(true);

      expect(isPickListEligible(OrderStatus.PENDING_PAYMENT)).toBe(false);
      expect(isPickListEligible(OrderStatus.PENDING_CONFIRMATION)).toBe(false);
      expect(isPickListEligible(OrderStatus.DELIVERED)).toBe(false);
      expect(isPickListEligible(OrderStatus.COMPLETED)).toBe(false);
      expect(isPickListEligible(OrderStatus.CANCELLED)).toBe(false);
    });

    it("groups pick list items by batchCode sorted by earliest expirationDate first", () => {
      const pickList: OrderPickListDto = {
        orderId: "ord-1",
        orderCode: "ORD-1001",
        orderStatus: OrderStatus.CONFIRMED,
        generatedAt: "2026-11-28T01:00:00.000Z",
        batches: [
          {
            batchId: "b-2",
            batchCode: "LOT-LATER",
            expirationDate: "2026-12-05T10:00:00.000Z",
            batchStatus: BatchStatus.IN_STOCK,
            isExpired: false,
            productId: "p-2",
            productName: "Cà chua bi",
            unit: "500g",
            allocatedQuantity: 2,
          },
          {
            batchId: "b-1",
            batchCode: "LOT-SOON",
            expirationDate: "2026-11-29T10:00:00.000Z",
            batchStatus: BatchStatus.NEAR_EXPIRY,
            isExpired: false,
            productId: "p-1",
            productName: "Cải bó xôi",
            unit: "300g",
            allocatedQuantity: 3,
          },
          {
            batchId: "b-1",
            batchCode: "LOT-SOON",
            expirationDate: "2026-11-29T10:00:00.000Z",
            batchStatus: BatchStatus.NEAR_EXPIRY,
            isExpired: false,
            productId: "p-3",
            productName: "Xà lách Romaine",
            unit: "250g",
            allocatedQuantity: 1,
          },
        ],
      };

      const grouped = groupPickListByBatch(pickList);
      expect(grouped).toHaveLength(2);
      expect(grouped[0]?.batchCode).toBe("LOT-SOON");
      expect(grouped[0]?.items).toHaveLength(2);
      expect(grouped[1]?.batchCode).toBe("LOT-LATER");
      expect(grouped[1]?.items).toHaveLength(1);
    });
  });

  describe("subscription COD 0đ indicators", () => {
    it("identifies subscription auto-orders when subscriptionId is non-null", () => {
      expect(isSubscriptionOrder({ subscriptionId: "sub-123" })).toBe(true);
      expect(isSubscriptionOrder({ subscriptionId: null })).toBe(false);
    });

    it("returns COD 0đ badge and paid status for subscription child orders", () => {
      const display = getOrderCodDisplay({
        subscriptionId: "sub-123",
        paymentMethod: PaymentMethod.SUBSCRIPTION,
        paymentStatus: PaymentStatus.PAID,
        totalAmountVnd: 250_000,
      });

      expect(display.isSubscription).toBe(true);
      expect(display.codVnd).toBe(0);
      expect(display.badgeLabel).toBe("Gói định kỳ · COD: 0đ");
      expect(display.paymentStatusLabel).toBe("Đã thanh toán");
    });

    it("computes COD collection amount for unpaid retail COD orders and 0đ for prepaid PayOS orders", () => {
      const retailCod = getOrderCodDisplay({
        subscriptionId: null,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PENDING,
        totalAmountVnd: 185_000,
      });
      expect(retailCod.isSubscription).toBe(false);
      expect(retailCod.codVnd).toBe(185_000);
      expect(retailCod.badgeLabel).toBeNull();

      const retailPayos = getOrderCodDisplay({
        subscriptionId: null,
        paymentMethod: PaymentMethod.PAYOS,
        paymentStatus: PaymentStatus.PAID,
        totalAmountVnd: 185_000,
      });
      expect(retailPayos.codVnd).toBe(0);
    });
  });

  describe("getActiveAllocations and getDeliveryScheduleCue", () => {
    it("filters out released allocations and sorts active ones by expirationDate", () => {
      const allocations = getActiveAllocations({
        items: [
          {
            id: "item-1",
            productId: "p-1",
            productName: "Cải ngọt",
            productSlug: "cai-ngot",
            productImageUrl: null,
            unit: "500g",
            quantity: 2,
            unitPriceVnd: 25_000,
            lineTotalVnd: 50_000,
            allocations: [
              {
                id: "a-released",
                batchId: "b-0",
                batchCode: "LOT-OLD",
                expirationDate: "2026-11-28T00:00:00.000Z",
                allocatedQuantity: 2,
                releasedAt: "2026-11-27T10:00:00.000Z",
              },
              {
                id: "a-later",
                batchId: "b-2",
                batchCode: "LOT-2",
                expirationDate: "2026-12-03T00:00:00.000Z",
                allocatedQuantity: 1,
                releasedAt: null,
              },
              {
                id: "a-sooner",
                batchId: "b-1",
                batchCode: "LOT-1",
                expirationDate: "2026-11-30T00:00:00.000Z",
                allocatedQuantity: 1,
                releasedAt: null,
              },
            ],
          },
        ],
      });

      expect(allocations.map((a) => a.batchCode)).toEqual(["LOT-1", "LOT-2"]);
    });

    it("derives route district cue from shipping address", () => {
      const cue = getDeliveryScheduleCue(
        "2026-11-24T04:00:00.000Z",
        "12 Nguyễn Duy Trinh, Phường Bình Trưng Tây, TP. Thủ Đức, TP.HCM",
      );

      expect(cue.dayLabel).toContain("Tuyến");
      expect(cue.routeCue).toBe("TP. Thủ Đức");
    });
  });
});
