import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  BadGatewayException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  API_ERROR_CODES,
  BUSINESS_RULES,
  DeliveryDay,
  PaymentStatus,
  SubscriptionStatus,
  UserStatus,
} from "@greenroots/shared";
import { payments, subscriptions } from "@/database/schemas";
import { createMockDb } from "../../../test/mocks/mock-database";
import {
  calculateSubscriptionSchedule,
  SubscriptionsService,
} from "./subscriptions.service";

type MockDb = ReturnType<typeof createMockDb> & {
  setSelectResultsQueue: (results: unknown[][]) => void;
};

describe("calculateSubscriptionSchedule", () => {
  it("computes next matching Tuesday or Friday strictly after today in Asia/Ho_Chi_Minh", () => {
    // 2026-11-26 is Thursday in Asia/Ho_Chi_Minh (09:00+07:00 = 02:00Z).
    // Tomorrow is Friday 2026-11-27.
    const thursday = new Date("2026-11-26T02:00:00.000Z");

    const fridaySchedule = calculateSubscriptionSchedule(
      DeliveryDay.FRIDAY,
      4,
      thursday,
    );
    expect(fridaySchedule).toEqual({
      startDate: "2026-11-27",
      endDate: "2026-12-18",
      yyyymmdd: "20261126",
    });

    const tuesdaySchedule = calculateSubscriptionSchedule(
      DeliveryDay.TUESDAY,
      2,
      thursday,
    );
    expect(tuesdaySchedule).toEqual({
      startDate: "2026-12-01",
      endDate: "2026-12-08",
      yyyymmdd: "20261126",
    });

    const bothSchedule = calculateSubscriptionSchedule(
      DeliveryDay.BOTH,
      3,
      thursday,
    );
    // 1: Fri 2026-11-27, 2: Tue 2026-12-01, 3: Fri 2026-12-04
    expect(bothSchedule).toEqual({
      startDate: "2026-11-27",
      endDate: "2026-12-04",
      yyyymmdd: "20261126",
    });
  });

  it("skips today even when today matches deliveryDay", () => {
    // 2026-11-27 is Friday in Asia/Ho_Chi_Minh.
    const friday = new Date("2026-11-27T01:00:00.000Z");
    const schedule = calculateSubscriptionSchedule(
      DeliveryDay.FRIDAY,
      1,
      friday,
    );
    expect(schedule.startDate).toBe("2026-12-04");
    expect(schedule.endDate).toBe("2026-12-04");
  });
});

describe("SubscriptionsService", () => {
  const customerId = "019fa8bc-8f4d-7000-b366-e691f45cfb01";
  const planId = "019fa8bc-8f4d-7000-b366-e691f45cfb02";
  const addressId = "019fa8bc-8f4d-7000-b366-e691f45cfb03";
  const subscriptionId = "019fa8bc-8f4d-7000-b366-e691f45cfb04";
  const paymentId = "019fa8bc-8f4d-7000-b366-e691f45cfb05";

  let mockDb: MockDb;
  let getSettingsMock: ReturnType<typeof mock>;
  let resolveAddressMock: ReturnType<typeof mock>;
  let quoteCoordinatesMock: ReturnType<typeof mock>;
  let createPaymentLinkMock: ReturnType<typeof mock>;
  let service: SubscriptionsService;

  beforeEach(() => {
    mockDb = createMockDb() as unknown as MockDb;
    getSettingsMock = mock(() =>
      Promise.resolve({
        isPayosEnabled: true,
        isCodEnabled: true,
        shippingConfig: {
          maxRadiusKm: 25,
          subscriptionFreeRadiusKm: 20,
        },
      }),
    );
    resolveAddressMock = mock(() =>
      Promise.resolve({
        id: addressId,
        receiverName: "Nguyễn Văn A",
        phoneNumber: "0901234567",
        formattedAddress: "123 Lê Lợi, Quận 1, TP. Hồ Chí Minh",
        districtCode: "quan-1",
        district: "Quận 1",
        city: "TP. Hồ Chí Minh",
        latitude: 10.7756,
        longitude: 106.7019,
      }),
    );
    quoteCoordinatesMock = mock(() =>
      Promise.resolve({
        straightLineKm: 5,
        roadDistanceKm: 6.5,
        feeVnd: 0,
        isDeliverable: true,
        isFreeShipping: true,
        maxRadiusKm: 25,
        subscriptionFreeRadiusKm: 20,
      }),
    );
    createPaymentLinkMock = mock(() =>
      Promise.resolve({
        orderCode: 1732579200123456,
        paymentLinkId: "mock-link-1",
        checkoutUrl: "https://pay.payos.vn/web/mock-link-1",
        qrCode: "mock-qr",
        status: "PENDING",
      }),
    );

    service = new SubscriptionsService(
      mockDb,
      { resolveAddressForQuote: resolveAddressMock } as never,
      { getSettings: getSettingsMock } as never,
      { quoteForCoordinates: quoteCoordinatesMock } as never,
      { createPaymentLink: createPaymentLinkMock } as never,
    );
  });

  describe("createSubscriptionCheckout", () => {
    // Invariant: INV-SUB-4
    it("rejects checkout when PayOS is disabled in farm settings", async () => {
      getSettingsMock.mockResolvedValueOnce({ isPayosEnabled: false });

      let caught: unknown;
      try {
        await service.createSubscriptionCheckout(customerId, {
          planId,
          addressId,
          deliveryDay: DeliveryDay.TUESDAY,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(UnprocessableEntityException);
      expect(
        (caught as UnprocessableEntityException).getResponse(),
      ).toMatchObject({
        code: API_ERROR_CODES.SUBSCRIPTION_PAYOS_DISABLED,
      });
    });

    // Invariant: INV-SUB-4
    it("rejects checkout when address is outside delivery radius", async () => {
      quoteCoordinatesMock.mockResolvedValueOnce({
        straightLineKm: 40,
        roadDistanceKm: 52,
        feeVnd: null,
        isDeliverable: false,
        isFreeShipping: false,
        maxRadiusKm: 25,
        subscriptionFreeRadiusKm: 20,
      });

      let caught: unknown;
      try {
        await service.createSubscriptionCheckout(customerId, {
          planId,
          addressId,
          deliveryDay: DeliveryDay.TUESDAY,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(UnprocessableEntityException);
      expect(
        (caught as UnprocessableEntityException).getResponse(),
      ).toMatchObject({
        code: API_ERROR_CODES.OUT_OF_DELIVERY_RADIUS,
        invalidParams: [
          expect.objectContaining({
            params: expect.objectContaining({
              maxRadiusKm: 25,
            }),
          }),
        ],
      });
    });

    it("rejects checkout when delivery address is missing or foreign", async () => {
      resolveAddressMock.mockRejectedValueOnce(
        new NotFoundException({
          code: API_ERROR_CODES.ADDRESS_NOT_FOUND,
          detail: "Delivery address not found",
        }),
      );

      let caught: unknown;
      try {
        await service.createSubscriptionCheckout(customerId, {
          planId,
          addressId,
          deliveryDay: DeliveryDay.TUESDAY,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: API_ERROR_CODES.ADDRESS_NOT_FOUND,
      });
    });

    it("rejects checkout when subscription plan is missing or deleted", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: customerId, status: UserStatus.ACTIVE }],
        [{ total: 0 }],
        [],
      ]);

      let caught: unknown;
      try {
        await service.createSubscriptionCheckout(customerId, {
          planId,
          addressId,
          deliveryDay: DeliveryDay.TUESDAY,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: API_ERROR_CODES.SUBSCRIPTION_PLAN_NOT_FOUND,
      });
    });

    // Invariant: INV-SUB-5
    it("rejects checkout when customer already holds maximum pending subscriptions", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: customerId, status: UserStatus.ACTIVE }],
        [{ total: BUSINESS_RULES.MAX_PENDING_SUBSCRIPTIONS_PER_CUSTOMER }],
      ]);

      let caught: unknown;
      try {
        await service.createSubscriptionCheckout(customerId, {
          planId,
          addressId,
          deliveryDay: DeliveryDay.TUESDAY,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(UnprocessableEntityException);
      expect(
        (caught as UnprocessableEntityException).getResponse(),
      ).toMatchObject({
        code: API_ERROR_CODES.SUBSCRIPTION_PENDING_LIMIT_REACHED,
      });
    });

    // Invariant: INV-SUB-1
    it("compensates pending subscription to cancelled and payment to failed on gateway error", async () => {
      const now = new Date();
      const subscriptionUpdates: Record<string, unknown>[] = [];
      const paymentUpdates: Record<string, unknown>[] = [];
      const origUpdate = mockDb.update.bind(mockDb);
      mockDb.update = ((table: unknown) => ({
        set: (vals: Record<string, unknown>) => {
          if (table === subscriptions) subscriptionUpdates.push(vals);
          if (table === payments) paymentUpdates.push(vals);
          return origUpdate(table as never).set(vals as never);
        },
      })) as unknown as typeof mockDb.update;

      mockDb.setSelectResultsQueue([
        [{ id: customerId, status: UserStatus.ACTIVE }],
        [{ total: 0 }],
        [
          {
            id: planId,
            name: "Gói Rau Gia Đình",
            price: 1_200_000,
            totalDeliveries: 8,
            weightPerDeliveryKg: "5.00",
            basketDescription: "Rau theo mùa",
            isActive: true,
          },
        ],
        [{ id: subscriptionId, status: SubscriptionStatus.PENDING_PAYMENT }],
      ]);

      const insertResults = [
        [
          {
            id: subscriptionId,
            subscriptionCode: "SUB-20261126-ABCDEF",
            planId,
            planName: "Gói Rau Gia Đình",
            price: 1_200_000,
            totalDeliveries: 8,
            weightPerDeliveryKg: "5.00",
            basketDescription: "Rau theo mùa",
            deliveryDay: DeliveryDay.TUESDAY,
            remainingDeliveries: 8,
            status: SubscriptionStatus.PENDING_PAYMENT,
            receiverName: "Nguyễn Văn A",
            receiverPhone: "0901234567",
            shippingAddress: "123 Lê Lợi, Quận 1, TP. Hồ Chí Minh",
            shippingDistanceKm: "6.50",
            shippingFeePerDelivery: 0,
            startDate: "2026-12-01",
            endDate: "2027-01-19",
            reservationExpiresAt: new Date(now.getTime() + 15 * 60_000),
            createdAt: now,
            updatedAt: now,
          },
        ],
        [{ id: paymentId }],
      ];
      mockDb.insert = (() => ({
        values: () => ({
          returning: () => Promise.resolve(insertResults.shift() ?? []),
        }),
      })) as unknown as typeof mockDb.insert;

      createPaymentLinkMock.mockRejectedValueOnce(new Error("PayOS timeout"));

      let caught: unknown;
      try {
        await service.createSubscriptionCheckout(customerId, {
          planId,
          addressId,
          deliveryDay: DeliveryDay.TUESDAY,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(BadGatewayException);
      expect((caught as BadGatewayException).getResponse()).toMatchObject({
        code: API_ERROR_CODES.PAYMENT_GATEWAY_ERROR,
      });
      expect(subscriptionUpdates).toHaveLength(1);
      expect(subscriptionUpdates[0]).toMatchObject({
        status: SubscriptionStatus.CANCELLED,
        reservationExpiresAt: null,
      });
      expect(paymentUpdates).toHaveLength(1);
      expect(paymentUpdates[0]).toMatchObject({
        status: PaymentStatus.FAILED,
      });
    });
  });

  describe("getMySubscriptionById", () => {
    it("throws not found when subscription does not exist or belongs to another customer", async () => {
      mockDb.setSelectResultsQueue([[]]);

      let caught: unknown;
      try {
        await service.getMySubscriptionById(customerId, subscriptionId);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: API_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
      });
    });
  });

  describe("expireStaleReservations", () => {
    it("returns zero without mutating records when no subscriptions have expired", async () => {
      mockDb.setSelectResultsQueue([[]]);

      const expiredCount = await service.expireStaleReservations(
        new Date("2026-11-26T10:00:00.000Z"),
      );

      expect(expiredCount).toBe(0);
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    // Invariant: INV-EXP-1, INV-EXP-2, INV-EXP-3
    it("cancels expired pending_payment subscriptions and invokes cancelPaymentLink post-commit", async () => {
      const now = new Date("2026-11-26T10:00:00.000Z");
      const subscriptionUpdates: Record<string, unknown>[] = [];
      const paymentUpdates: Record<string, unknown>[] = [];

      const origUpdate = mockDb.update.bind(mockDb);
      mockDb.update = ((table: unknown) => ({
        set: (vals: Record<string, unknown>) => {
          if (table === subscriptions) subscriptionUpdates.push(vals);
          if (table === payments) paymentUpdates.push(vals);
          return origUpdate(table as never).set(vals as never);
        },
      })) as unknown as typeof mockDb.update;

      const cancelPaymentLinkMock = mock(() =>
        Promise.resolve({
          paymentLinkId: "link-1",
          orderCode: 987654321,
          status: "CANCELLED" as const,
          canceledAt: now.toISOString(),
          cancellationReason: "Subscription reservation expired",
        }),
      );
      (
        service as unknown as {
          paymentDriver: { cancelPaymentLink: typeof cancelPaymentLinkMock };
        }
      ).paymentDriver.cancelPaymentLink = cancelPaymentLinkMock;

      mockDb.setSelectResultsQueue([
        [{ id: subscriptionId }],
        [{ orderCode: 987654321 }],
        [],
      ]);

      const expiredCount = await service.expireStaleReservations(now);

      expect(expiredCount).toBe(1);
      expect(subscriptionUpdates).toHaveLength(1);
      expect(subscriptionUpdates[0]).toMatchObject({
        status: SubscriptionStatus.CANCELLED,
        reservationExpiresAt: null,
        updatedAt: now,
      });
      expect(paymentUpdates).toHaveLength(1);
      expect(paymentUpdates[0]).toMatchObject({
        status: PaymentStatus.CANCELLED,
        updatedAt: now,
      });
      expect(cancelPaymentLinkMock).toHaveBeenCalledWith(
        987654321,
        "Subscription reservation expired",
      );
    });
  });
});
