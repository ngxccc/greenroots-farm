import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  API_ERROR_CODES,
  BUSINESS_RULES,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  UserStatus,
} from "@greenroots/shared";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import type { FarmSettings } from "@/modules/farms/dto";
import type { FarmSettingsService } from "@/modules/farms/farm-settings.service";
import type { AddressService } from "@/modules/users/address.service";
import type { ResolvedQuoteAddress } from "@/modules/users/users.interface";
import { createMockDb } from "../../../test/mocks/mock-database";
import { checkoutRequestSchema, validateCartRequestSchema } from "./dto";
import { OrdersService } from "./orders.service";
import type { ShippingQuote } from "./shipping/dto";
import type { ShippingService } from "./shipping/shipping.service";

type MockDb = ReturnType<typeof createMockDb> & {
  setSelectResult: (result: unknown[]) => void;
  setSelectResultsQueue: (results: unknown[][]) => void;
};

describe("OrdersService", () => {
  const userId = "019fa8bc-8f4d-7000-b366-e691f45cfb91";
  const productAId = "019fa8bc-8f4d-7000-b366-e691f45cfb11";
  const productBId = "019fa8bc-8f4d-7000-b366-e691f45cfb22";
  const addressId = "019fa8bc-8f4d-7000-b366-e691f45cfb99";

  const baseSettings: FarmSettings = {
    id: "019fa8bc-8f4d-7000-b366-e691f45cfb90",
    name: "GreenRoots Farm",
    legalName: "GreenRoots Farm Co.",
    tagline: null,
    taxId: null,
    address: BUSINESS_RULES.FARM_COORDINATES.ADDRESS,
    latitude: BUSINESS_RULES.FARM_COORDINATES.LATITUDE,
    longitude: BUSINESS_RULES.FARM_COORDINATES.LONGITUDE,
    certificationUrl: null,
    hotlines: { primary: "0909123456" },
    emails: { primary: "hello@greenroots.farm" },
    workingHours: { weekdays: "07:00-18:00", weekend: "07:00-12:00" },
    bankInfo: null,
    shippingConfig: {
      baseFeeVnd: 15000,
      freeKmThreshold: 3,
      perKmRateVnd: 5000,
      detourFactor: 1.3,
    },
    flashSaleConfig: {
      hoursThreshold: 48,
      discountPercent: 50,
    },
    isPayosEnabled: true,
    isCodEnabled: true,
    createdAt: "2026-11-21T00:00:00.000Z",
    updatedAt: "2026-11-21T00:00:00.000Z",
  };

  const resolvedAddress: ResolvedQuoteAddress = {
    id: addressId,
    receiverName: "Nguyen Van An",
    phoneNumber: "0912345678",
    formattedAddress: "12 Nguyen Van Linh, Quận 7, TP. Hồ Chí Minh",
    districtCode: "quan-7",
    district: "Quận 7",
    city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
    latitude: 10.734,
    longitude: 106.7218,
  };

  const deliverableQuote: ShippingQuote = {
    straightLineKm: 10,
    roadDistanceKm: 13,
    feeVnd: 65000,
    isDeliverable: true,
    isFreeShipping: false,
    maxRadiusKm: 25,
    subscriptionFreeRadiusKm: 20,
  };

  let mockDb: MockDb;
  let resolveAddressMock: ReturnType<typeof mock>;
  let resolveOptionalDefaultMock: ReturnType<typeof mock>;
  let quoteForCustomerMock: ReturnType<typeof mock>;
  let quoteForCoordinatesMock: ReturnType<typeof mock>;
  let getSettingsMock: ReturnType<typeof mock>;
  let service: OrdersService;

  beforeEach(() => {
    mockDb = createMockDb() as unknown as MockDb;
    resolveAddressMock = mock(() => Promise.resolve(resolvedAddress));
    resolveOptionalDefaultMock = mock(() => Promise.resolve(null));
    quoteForCustomerMock = mock(() => Promise.resolve(deliverableQuote));
    quoteForCoordinatesMock = mock(() => Promise.resolve(deliverableQuote));
    getSettingsMock = mock(() => Promise.resolve(baseSettings));

    service = new OrdersService(
      mockDb,
      {
        resolveAddressForQuote: resolveAddressMock,
        resolveOptionalDefaultAddressForQuote: resolveOptionalDefaultMock,
      } as unknown as AddressService,
      {
        quoteForCustomer: quoteForCustomerMock,
        quoteForCoordinates: quoteForCoordinatesMock,
      } as unknown as ShippingService,
      {
        getSettings: getSettingsMock,
      } as unknown as FarmSettingsService,
    );
  });

  function stubOrderInserts() {
    const now = new Date("2026-11-21T03:00:00.000Z");
    let insertCount = 0;
    const originalInsert = mockDb.insert.bind(mockDb);

    mockDb.insert = ((table: unknown) => {
      insertCount += 1;
      if (insertCount % 3 === 1) {
        return {
          values: () => ({
            returning: () =>
              Promise.resolve([
                {
                  id: "019fa8bc-8f4d-7000-b366-e691f45cfb50",
                  orderCode: "ORD-20261121-ABC123",
                  orderStatus: OrderStatus.PENDING_CONFIRMATION,
                  paymentMethod: PaymentMethod.COD,
                  paymentStatus: PaymentStatus.PENDING,
                  receiverName: "Nguyen Van An",
                  receiverPhone: "0912345678",
                  shippingAddress:
                    "12 Nguyen Van Linh, Quận 7, TP. Hồ Chí Minh",
                  shippingFee: 65_000,
                  subtotal: 160_000,
                  discountAmount: 50_000,
                  loyaltyPointsUsed: 50_000,
                  totalAmount: 175_000,
                  createdAt: now,
                  updatedAt: now,
                },
              ]),
          }),
        };
      }
      if (insertCount % 3 === 2) {
        return {
          values: () => ({
            returning: () =>
              Promise.resolve([
                {
                  id: "019fa8bc-8f4d-7000-b366-e691f45cfb51",
                  productId: productAId,
                },
              ]),
          }),
        };
      }
      return originalInsert(table as never);
    }) as typeof mockDb.insert;
  }

  describe("DTO validation", () => {
    it("rejects both addressId and districtCode on validate-cart", () => {
      const parsed = validateCartRequestSchema.safeParse({
        items: [{ productId: productAId, quantity: 1 }],
        addressId,
        districtCode: "quan-7",
      });

      expect(parsed.success).toBe(false);
    });

    it("rejects more than 2 decimal places or unknown pricing fields on checkout", () => {
      expect(
        checkoutRequestSchema.safeParse({
          items: [{ productId: productAId, quantity: 1.234 }],
        }).success,
      ).toBe(false);

      expect(
        checkoutRequestSchema.safeParse({
          items: [{ productId: productAId, quantity: 1 }],
          totalAmountVnd: 1000,
        }).success,
      ).toBe(false);
    });
  });

  describe("validateCart", () => {
    // Invariant: INV-ORD-1, INV-ORD-4
    it("merges duplicate productIds, computes catalog prices, caps loyalty at subtotal, and debug-logs clientTotalVnd mismatch", async () => {
      const debugSpy = spyOn(Logger.prototype, "debug");
      debugSpy.mockClear();

      mockDb.setSelectResultsQueue([
        [
          {
            id: userId,
            status: UserStatus.ACTIVE,
            rewardPoints: 500_000,
          },
        ],
        [
          {
            id: productBId,
            name: "Cai bo xoi",
            slug: "cai-bo-xoi",
            unit: "kg",
            basePrice: 50_000,
            salePrice: null,
            isActive: true,
            deletedAt: null,
            categoryIsActive: true,
            categoryDeletedAt: null,
            availableQuantity: "10.00",
          },
          {
            id: productAId,
            name: "Ca chua bi",
            slug: "ca-chua-bi",
            unit: "kg",
            basePrice: 60_000,
            salePrice: 40_000,
            isActive: true,
            deletedAt: null,
            categoryIsActive: true,
            categoryDeletedAt: null,
            availableQuantity: "5.00",
          },
        ],
      ]);

      const result = await service.validateCart(userId, {
        items: [
          { productId: productBId, quantity: 1.5 },
          { productId: productAId, quantity: 1 },
          { productId: productAId, quantity: 1.5 },
        ],
        districtCode: "quan-7",
        loyaltyPoints: 300_000,
        clientTotalVnd: 1_000,
      });

      // Product A: 2.5 kg * 40,000 = 100,000; Product B: 1.5 kg * 50,000 = 75,000 -> subtotal = 175,000
      expect(result.subtotalVnd).toBe(175_000);
      expect(result.meetsMinOrderValue).toBe(true);
      expect(result.appliedLoyaltyPoints).toBe(175_000);
      expect(result.discountAmountVnd).toBe(175_000);
      // Loyalty never deducts shippingFee (65,000)
      expect(result.totalAmountVnd).toBe(65_000);
      expect(result.isValid).toBe(true);
      expect(result.items.map((i) => i.productId)).toEqual([
        productAId,
        productBId,
      ]);
      expect(result.items[0]?.requestedQuantity).toBe(2.5);
      expect(
        debugSpy.mock.calls.some(
          ([msg]) =>
            typeof msg === "string" && msg.includes("server=65000 client=1000"),
        ),
      ).toBe(true);
    });

    it("returns null shipping and invalid flag when customer has no saved address and omits target", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: userId, status: UserStatus.ACTIVE, rewardPoints: 0 }],
        [
          {
            id: productAId,
            name: "Ca chua bi",
            slug: "ca-chua-bi",
            unit: "kg",
            basePrice: 80_000,
            salePrice: null,
            isActive: true,
            deletedAt: null,
            categoryIsActive: true,
            categoryDeletedAt: null,
            availableQuantity: "5.00",
          },
        ],
      ]);

      const result = await service.validateCart(userId, {
        items: [{ productId: productAId, quantity: 2 }],
        loyaltyPoints: 0,
      });

      expect(result.shipping).toBeNull();
      expect(result.meetsMinOrderValue).toBe(true);
      expect(result.isValid).toBe(false);
    });

    it("rejects suspended customer accounts during cart validation", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: userId, status: UserStatus.SUSPENDED, rewardPoints: 0 }],
      ]);

      let caught: unknown;
      try {
        await service.validateCart(userId, {
          items: [{ productId: productAId, quantity: 2 }],
          loyaltyPoints: 0,
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ForbiddenException);
      expect(
        (caught as ForbiddenException).getResponse() as { code: string },
      ).toMatchObject({ code: API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED });
    });

    it("rejects merged item quantities exceeding maximum quantity bound", () => {
      expect(
        service.validateCart(userId, {
          items: [
            { productId: productAId, quantity: 6000 },
            { productId: productAId, quantity: 5000 },
          ],
          loyaltyPoints: 0,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("checkoutCod", () => {
    it("rejects COD checkout when farm COD setting is disabled", async () => {
      getSettingsMock.mockImplementation(() =>
        Promise.resolve({ ...baseSettings, isCodEnabled: false }),
      );

      let caught: unknown;
      try {
        await service.checkoutCod(userId, {
          items: [{ productId: productAId, quantity: 2 }],
          loyaltyPoints: 0,
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(UnprocessableEntityException);
      expect(
        (caught as UnprocessableEntityException).getResponse() as {
          code: string;
        },
      ).toMatchObject({ code: API_ERROR_CODES.ORDER_COD_DISABLED });
    });

    // Invariant: INV-ORD-3
    it("rejects out-of-radius address with maximum radius parameter", async () => {
      quoteForCoordinatesMock.mockImplementation(() =>
        Promise.resolve({
          straightLineKm: 25,
          roadDistanceKm: 32.5,
          feeVnd: null,
          isDeliverable: false,
          isFreeShipping: false,
          maxRadiusKm: 25,
          subscriptionFreeRadiusKm: 20,
        }),
      );

      let caught: unknown;
      try {
        await service.checkoutCod(userId, {
          items: [{ productId: productAId, quantity: 2 }],
          loyaltyPoints: 0,
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(UnprocessableEntityException);
      const response = (
        caught as UnprocessableEntityException
      ).getResponse() as {
        code: string;
        invalidParams: { params?: Record<string, unknown> }[];
      };
      expect(response.code).toBe(API_ERROR_CODES.OUT_OF_DELIVERY_RADIUS);
      expect(response.invalidParams[0]?.params?.["maxRadiusKm"]).toBe(25);
    });

    it("rejects suspended customer accounts during checkout", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: userId, status: UserStatus.SUSPENDED, rewardPoints: 50_000 }],
      ]);

      let caught: unknown;
      try {
        await service.checkoutCod(userId, {
          items: [{ productId: productAId, quantity: 2 }],
          loyaltyPoints: 0,
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ForbiddenException);
      expect(
        (caught as ForbiddenException).getResponse() as { code: string },
      ).toMatchObject({ code: API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED });
    });

    it("rejects missing or inactive SKU during checkout", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: userId, status: UserStatus.ACTIVE, rewardPoints: 0 }],
        [],
      ]);

      let caught: unknown;
      try {
        await service.checkoutCod(userId, {
          items: [{ productId: productAId, quantity: 2 }],
          loyaltyPoints: 0,
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect(
        (caught as NotFoundException).getResponse() as { code: string },
      ).toMatchObject({ code: API_ERROR_CODES.PRODUCT_NOT_FOUND });
    });

    it("rejects stock shortage during checkout", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: userId, status: UserStatus.ACTIVE, rewardPoints: 0 }],
        [
          {
            id: productAId,
            name: "Ca chua bi",
            slug: "ca-chua-bi",
            unit: "kg",
            basePrice: 80_000,
            salePrice: null,
            isActive: true,
            deletedAt: null,
            categoryIsActive: true,
            categoryDeletedAt: null,
            availableQuantity: "1.00",
          },
        ],
      ]);

      let caught: unknown;
      try {
        await service.checkoutCod(userId, {
          items: [{ productId: productAId, quantity: 2 }],
          loyaltyPoints: 0,
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      expect(
        (caught as ConflictException).getResponse() as { code: string },
      ).toMatchObject({ code: API_ERROR_CODES.INSUFFICIENT_STOCK });
    });

    // Invariant: INV-ORD-2
    it("rejects subtotal below minimum order value with threshold details", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: userId, status: UserStatus.ACTIVE, rewardPoints: 0 }],
        [
          {
            id: productAId,
            name: "Ca chua bi",
            slug: "ca-chua-bi",
            unit: "kg",
            basePrice: 70_000,
            salePrice: null,
            isActive: true,
            deletedAt: null,
            categoryIsActive: true,
            categoryDeletedAt: null,
            availableQuantity: "10.00",
          },
        ],
      ]);

      let caught: unknown;
      try {
        await service.checkoutCod(userId, {
          items: [{ productId: productAId, quantity: 2 }],
          loyaltyPoints: 0,
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(UnprocessableEntityException);
      const response = (
        caught as UnprocessableEntityException
      ).getResponse() as {
        code: string;
        invalidParams: { params?: Record<string, unknown> }[];
      };
      expect(response.code).toBe(API_ERROR_CODES.ORDER_BELOW_MINIMUM_VALUE);
      expect(response.invalidParams[0]?.params?.["minOrderValueVnd"]).toBe(
        150_000,
      );
      expect(response.invalidParams[0]?.params?.["currentSubtotalVnd"]).toBe(
        140_000,
      );
    });

    // Invariant: INV-ORD-1, INV-ORD-5
    it("creates COD order with recipient snapshot, closed projection, and debug-logs clientTotalVnd mismatch", async () => {
      const debugSpy = spyOn(Logger.prototype, "debug");
      debugSpy.mockClear();

      mockDb.setSelectResultsQueue([
        [{ id: userId, status: UserStatus.ACTIVE, rewardPoints: 50_000 }],
        [
          {
            id: productAId,
            name: "Ca chua bi",
            slug: "ca-chua-bi",
            unit: "kg",
            basePrice: 80_000,
            salePrice: null,
            isActive: true,
            deletedAt: null,
            categoryIsActive: true,
            categoryDeletedAt: null,
            availableQuantity: "10.00",
          },
        ],
      ]);
      stubOrderInserts();

      const result = await service.checkoutCod(userId, {
        items: [{ productId: productAId, quantity: 2 }],
        loyaltyPoints: 90_000,
        clientTotalVnd: 99_999,
      });

      expect(result.orderStatus).toBe(OrderStatus.PENDING_CONFIRMATION);
      expect(result.paymentMethod).toBe(PaymentMethod.COD);
      expect(result.paymentStatus).toBe(PaymentStatus.PENDING);
      expect(result.receiverName).toBe("Nguyen Van An");
      expect(result.receiverPhone).toBe("0912345678");
      expect(result.shippingAddress).toBe(
        "12 Nguyen Van Linh, Quận 7, TP. Hồ Chí Minh",
      );
      expect(result.subtotalVnd).toBe(160_000);
      expect(result.loyaltyPointsUsed).toBe(50_000);
      expect(result.totalAmountVnd).toBe(175_000);
      expect(result.items).toHaveLength(1);
      expect(
        debugSpy.mock.calls.some(
          ([msg]) =>
            typeof msg === "string" &&
            msg.includes("server=175000 client=99999"),
        ),
      ).toBe(true);
    });

    it("retries on orderCode unique violation and succeeds on subsequent attempt", async () => {
      const activeRow = [
        { id: userId, status: UserStatus.ACTIVE, rewardPoints: 50_000 },
      ];
      const productRow = [
        {
          id: productAId,
          name: "Ca chua bi",
          slug: "ca-chua-bi",
          unit: "kg",
          basePrice: 80_000,
          salePrice: null,
          isActive: true,
          deletedAt: null,
          categoryIsActive: true,
          categoryDeletedAt: null,
          availableQuantity: "10.00",
        },
      ];
      mockDb.setSelectResultsQueue([
        activeRow,
        productRow,
        activeRow,
        productRow,
      ]);

      stubOrderInserts();
      const secondTryInsert = mockDb.insert;
      let attempt = 0;
      mockDb.insert = ((table: unknown) => {
        attempt += 1;
        if (attempt === 1) {
          return {
            values: () => ({
              returning: () =>
                Promise.reject(
                  Object.assign(new Error("duplicate orderCode"), {
                    code: PG_ERROR_CODE.UNIQUE_VIOLATION,
                    constraint: "orders_order_code_uidx",
                  }),
                ),
            }),
          };
        }
        return secondTryInsert(table as never);
      }) as typeof mockDb.insert;

      const result = await service.checkoutCod(userId, {
        items: [{ productId: productAId, quantity: 2 }],
        loyaltyPoints: 50_000,
      });

      expect(result.orderCode).toMatch(/^ORD-\d{8}-[0-9A-HJKMNP-TV-Z]{6}$/);
    });

    it("throws conflict after exhausting maximum orderCode generation retries", async () => {
      const activeRow = [
        { id: userId, status: UserStatus.ACTIVE, rewardPoints: 0 },
      ];
      const productRow = [
        {
          id: productAId,
          name: "Ca chua bi",
          slug: "ca-chua-bi",
          unit: "kg",
          basePrice: 80_000,
          salePrice: null,
          isActive: true,
          deletedAt: null,
          categoryIsActive: true,
          categoryDeletedAt: null,
          availableQuantity: "10.00",
        },
      ];
      mockDb.setSelectResultsQueue([
        activeRow,
        productRow,
        activeRow,
        productRow,
        activeRow,
        productRow,
        activeRow,
        productRow,
        activeRow,
        productRow,
      ]);

      mockDb.insert = (() => ({
        values: () => ({
          returning: () =>
            Promise.reject(
              Object.assign(new Error("duplicate orderCode"), {
                code: PG_ERROR_CODE.UNIQUE_VIOLATION,
                constraint: "orders_order_code_uidx",
              }),
            ),
        }),
      })) as unknown as typeof mockDb.insert;

      let caught: unknown;
      try {
        await service.checkoutCod(userId, {
          items: [{ productId: productAId, quantity: 2 }],
          loyaltyPoints: 0,
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      expect(
        (caught as ConflictException).getResponse() as { code: string },
      ).toMatchObject({ code: API_ERROR_CODES.CONFLICT_RECORD });
    });
  });
});
