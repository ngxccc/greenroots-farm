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
  BatchStatus,
  BUSINESS_RULES,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  UserStatus,
} from "@greenroots/shared";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import {
  batchAllocations,
  batches,
  orderItems,
  orders,
  payments,
  users,
} from "@/database/schemas";
import type { FarmSettings } from "@/modules/farms/dto";
import type { FarmSettingsService } from "@/modules/farms/farm-settings.service";
import type { AddressService } from "@/modules/users/address.service";
import type { ResolvedQuoteAddress } from "@/modules/users/users.interface";
import { createMockDb } from "../../../test/mocks/mock-database";
import {
  checkoutRequestSchema,
  listMyOrdersQuerySchema,
  updateOrderStatusRequestSchema,
  validateCartRequestSchema,
} from "./dto";
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
    address: BUSINESS_RULES.FULFILLMENT_HUB.ADDRESS,
    latitude: BUSINESS_RULES.FULFILLMENT_HUB.LATITUDE,
    longitude: BUSINESS_RULES.FULFILLMENT_HUB.LONGITUDE,
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
      maxRadiusKm: 25,
      subscriptionFreeRadiusKm: 20,
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

  function stubOrderInserts(options?: {
    onInsert?: (table: unknown, values: unknown) => void;
    onUpdate?: (table: unknown, values: Record<string, unknown>) => void;
  }) {
    const now = new Date("2026-11-21T03:00:00.000Z");
    const originalInsert = mockDb.insert.bind(mockDb);
    const originalUpdate = mockDb.update.bind(mockDb);

    mockDb.insert = ((table: unknown) => ({
      values: (vals: unknown) => {
        options?.onInsert?.(table, vals);
        if (table === orders) {
          return {
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
                  shippingDistanceKm: "13.00",
                  shippingFee: 65_000,
                  subtotal: 160_000,
                  discountAmount: 50_000,
                  loyaltyPointsUsed: 50_000,
                  totalAmount: 175_000,
                  createdAt: now,
                  updatedAt: now,
                },
              ]),
          };
        }
        if (table === orderItems) {
          return {
            returning: () =>
              Promise.resolve([
                {
                  id: "019fa8bc-8f4d-7000-b366-e691f45cfb51",
                  productId: productAId,
                },
              ]),
          };
        }
        return originalInsert(table as never).values(vals as never);
      },
    })) as typeof mockDb.insert;

    if (options?.onUpdate) {
      const onUpdate = options.onUpdate;
      mockDb.update = ((table: unknown) => ({
        set: (vals: Record<string, unknown>) => {
          onUpdate(table, vals);
          return originalUpdate(table as never).set(vals as never);
        },
      })) as unknown as typeof mockDb.update;
    }
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

    it("rejects customerId, unknown keys, and invalid sort or limit on listMyOrdersQuerySchema", () => {
      expect(
        listMyOrdersQuerySchema.safeParse({
          customerId: userId,
        }).success,
      ).toBe(false);

      expect(
        listMyOrdersQuerySchema.safeParse({
          sort: "orderCode:asc",
        }).success,
      ).toBe(false);

      expect(
        listMyOrdersQuerySchema.safeParse({
          limit: "101",
        }).success,
      ).toBe(false);

      const valid = listMyOrdersQuerySchema.parse({
        status: OrderStatus.PENDING_CONFIRMATION,
        page: "2",
        limit: "10",
        sort: "totalAmount:desc",
      });
      expect(valid).toEqual({
        status: OrderStatus.PENDING_CONFIRMATION,
        page: 2,
        limit: 10,
        sort: "totalAmount:desc",
      });

      expect(
        listMyOrdersQuerySchema.parse({ sort: "createdAt:asc" }).sort,
      ).toBe("createdAt:asc");

      const multiStatus = listMyOrdersQuerySchema.parse({
        statuses: `${OrderStatus.PENDING_PAYMENT},${OrderStatus.PENDING_CONFIRMATION},${OrderStatus.CONFIRMED}`,
      });
      expect(multiStatus.statuses).toEqual([
        OrderStatus.PENDING_PAYMENT,
        OrderStatus.PENDING_CONFIRMATION,
        OrderStatus.CONFIRMED,
      ]);

      expect(
        listMyOrdersQuerySchema.safeParse({
          statuses: "pending_payment,invalid_status",
        }).success,
      ).toBe(false);

      expect(
        listMyOrdersQuerySchema.safeParse({
          status: OrderStatus.PENDING_CONFIRMATION,
          statuses: OrderStatus.SHIPPING,
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
            imageUrls: [
              "https://res.cloudinary.com/greenroots-dev/image/upload/v1/products/cai.webp",
            ],
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
            imageUrls: null,
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
            imageUrls: [
              "https://res.cloudinary.com/greenroots-dev/image/upload/v1/products/ca-chua.webp",
            ],
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

    it("rejects suspended customer accounts during checkout without opening transaction", async () => {
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
      expect(mockDb.transaction).not.toHaveBeenCalled();
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
            imageUrls: [
              "https://res.cloudinary.com/greenroots-dev/image/upload/v1/products/ca-chua.webp",
            ],
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
            imageUrls: null,
            unit: "kg",
            basePrice: 20_000,
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
        50_000,
      );
      expect(response.invalidParams[0]?.params?.["currentSubtotalVnd"]).toBe(
        40_000,
      );
    });

    // Invariant: INV-ORD-1, INV-ORD-5, INV-ORD-18, INV-ORD-19
    it("creates COD order with FEFO batch allocations, reservation expiry, recipient snapshot, and debug-logs clientTotalVnd mismatch", async () => {
      const debugSpy = spyOn(Logger.prototype, "debug");
      debugSpy.mockClear();

      const batch1Id = "019fa8bc-8f4d-7000-b366-e691f45cfb61";
      const batch2Id = "019fa8bc-8f4d-7000-b366-e691f45cfb62";
      const earlierExp = new Date("2026-11-22T06:00:00.000Z");
      const laterExp = new Date("2026-11-24T06:00:00.000Z");

      const insertedOrderPayloads: Record<string, unknown>[] = [];
      const insertedAllocationPayloads: unknown[] = [];
      const batchUpdates: Record<string, unknown>[] = [];

      mockDb.setSelectResultsQueue([
        [{ id: userId, status: UserStatus.ACTIVE, rewardPoints: 50_000 }],
        [
          {
            id: productAId,
            name: "Ca chua bi",
            slug: "ca-chua-bi",
            imageUrls: [
              "https://res.cloudinary.com/greenroots-dev/image/upload/v1/products/ca-chua.webp",
            ],
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
        [
          {
            id: batch2Id,
            productId: productAId,
            batchCode: "BATCH-LATER",
            expirationDate: laterExp,
            availableQuantity: "5.00",
            status: BatchStatus.IN_STOCK,
          },
          {
            id: batch1Id,
            productId: productAId,
            batchCode: "BATCH-EARLIER",
            expirationDate: earlierExp,
            availableQuantity: "1.50",
            status: BatchStatus.NEAR_EXPIRY,
          },
        ],
        [{ id: userId, status: UserStatus.ACTIVE, rewardPoints: 50_000 }],
        [{ total: 0 }],
      ]);
      stubOrderInserts({
        onInsert: (table, values) => {
          if (table === orders) {
            insertedOrderPayloads.push(values as Record<string, unknown>);
          }
          if (table === batchAllocations) {
            insertedAllocationPayloads.push(values);
          }
        },
        onUpdate: (table, values) => {
          if (table === batches) {
            batchUpdates.push(values);
          }
        },
      });

      const beforeMs = Date.now();
      const result = await service.checkoutCod(userId, {
        items: [{ productId: productAId, quantity: 2 }],
        loyaltyPoints: 90_000,
        clientTotalVnd: 99_999,
      });
      const afterMs = Date.now();

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

      const expiresAt = insertedOrderPayloads[0]?.[
        "reservationExpiresAt"
      ] as Date;
      expect(expiresAt).toBeInstanceOf(Date);
      const timeoutMs =
        BUSINESS_RULES.COD_CONFIRMATION_TIMEOUT_MINUTES * 60_000;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(beforeMs + timeoutMs);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(afterMs + timeoutMs);

      const allocRows = insertedAllocationPayloads[0] as {
        batchId: string;
        allocatedQuantity: string;
      }[];
      expect(allocRows).toHaveLength(2);
      expect(allocRows[0]).toMatchObject({
        batchId: batch1Id,
        allocatedQuantity: "1.50",
      });
      expect(allocRows[1]).toMatchObject({
        batchId: batch2Id,
        allocatedQuantity: "0.50",
      });
      expect(batchUpdates[0]).toMatchObject({
        availableQuantity: "0.00",
        status: BatchStatus.SOLD_OUT,
      });
      expect(batchUpdates[1]).toMatchObject({
        availableQuantity: "4.50",
        status: BatchStatus.IN_STOCK,
      });

      expect(
        debugSpy.mock.calls.some(
          ([msg]) =>
            typeof msg === "string" &&
            msg.includes("server=175000 client=99999"),
        ),
      ).toBe(true);
    });

    // Invariant: INV-ORD-18
    it("rejects checkout with insufficient stock when locked batches cannot fulfill requested quantity", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: userId, status: UserStatus.ACTIVE, rewardPoints: 0 }],
        [
          {
            id: productAId,
            name: "Ca chua bi",
            slug: "ca-chua-bi",
            imageUrls: null,
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
        [
          {
            id: "019fa8bc-8f4d-7000-b366-e691f45cfb61",
            productId: productAId,
            batchCode: "BATCH-1",
            expirationDate: new Date("2026-11-24T00:00:00.000Z"),
            availableQuantity: "1.00",
            status: BatchStatus.IN_STOCK,
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
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    // Invariant: INV-ORD-20
    it("rejects checkout when customer has reached maximum pending COD orders", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: userId, status: UserStatus.ACTIVE, rewardPoints: 0 }],
        [
          {
            id: productAId,
            name: "Ca chua bi",
            slug: "ca-chua-bi",
            imageUrls: null,
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
        [
          {
            id: "019fa8bc-8f4d-7000-b366-e691f45cfb61",
            productId: productAId,
            batchCode: "BATCH-1",
            expirationDate: new Date("2026-11-24T00:00:00.000Z"),
            availableQuantity: "10.00",
            status: BatchStatus.IN_STOCK,
          },
        ],
        [{ id: userId, status: UserStatus.ACTIVE, rewardPoints: 0 }],
        [{ total: BUSINESS_RULES.MAX_PENDING_COD_ORDERS_PER_CUSTOMER }],
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
      expect(
        (caught as UnprocessableEntityException).getResponse() as {
          code: string;
        },
      ).toMatchObject({
        code: API_ERROR_CODES.ORDER_PENDING_LIMIT_EXCEEDED,
      });
      expect(mockDb.insert).not.toHaveBeenCalled();
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
      const batchRow = [
        {
          id: "019fa8bc-8f4d-7000-b366-e691f45cfb61",
          productId: productAId,
          batchCode: "BATCH-1",
          expirationDate: new Date("2026-11-24T00:00:00.000Z"),
          availableQuantity: "10.00",
          status: BatchStatus.IN_STOCK,
        },
      ];
      const pendingCountRow = [{ total: 0 }];
      mockDb.setSelectResultsQueue([
        activeRow,
        productRow,
        batchRow,
        activeRow,
        pendingCountRow,
        activeRow,
        productRow,
        batchRow,
        activeRow,
        pendingCountRow,
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
      const batchRow = [
        {
          id: "019fa8bc-8f4d-7000-b366-e691f45cfb61",
          productId: productAId,
          batchCode: "BATCH-1",
          expirationDate: new Date("2026-11-24T00:00:00.000Z"),
          availableQuantity: "10.00",
          status: BatchStatus.IN_STOCK,
        },
      ];
      const pendingCountRow = [{ total: 0 }];
      mockDb.setSelectResultsQueue([
        activeRow,
        productRow,
        batchRow,
        activeRow,
        pendingCountRow,
        activeRow,
        productRow,
        batchRow,
        activeRow,
        pendingCountRow,
        activeRow,
        productRow,
        batchRow,
        activeRow,
        pendingCountRow,
        activeRow,
        productRow,
        batchRow,
        activeRow,
        pendingCountRow,
        activeRow,
        productRow,
        batchRow,
        activeRow,
        pendingCountRow,
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

  describe("listMyOrders", () => {
    it("short-circuits item hydration when total is zero or offset exceeds total", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: userId, status: UserStatus.ACTIVE, rewardPoints: 0 }],
        [{ total: 0 }],
        [{ id: userId, status: UserStatus.ACTIVE, rewardPoints: 0 }],
        [{ total: 2 }],
      ]);

      const empty = await service.listMyOrders(userId, {
        page: 1,
        limit: 20,
        sort: "createdAt:desc",
      });
      expect(empty.items).toEqual([]);
      expect(empty.meta).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });

      const beyondPage = await service.listMyOrders(userId, {
        page: 3,
        limit: 20,
        sort: "createdAt:desc",
      });
      expect(beyondPage.items).toEqual([]);
      expect(beyondPage.meta).toEqual({
        page: 3,
        limit: 20,
        total: 2,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: true,
      });
    });

    // Invariant: INV-ORD-8, INV-ORD-10
    it("hydrates paginated order rows with thumbnail URLs and integer-cent line totals", async () => {
      const orderId = "019fa8bc-8f4d-7000-b366-e691f45cfb50";
      const createdAt = new Date("2026-11-21T03:00:00.000Z");
      const updatedAt = new Date("2026-11-21T03:05:00.000Z");

      mockDb.setSelectResultsQueue([
        [{ id: userId, status: UserStatus.ACTIVE, rewardPoints: 0 }],
        [{ total: 1 }],
        [
          {
            id: orderId,
            orderCode: "ORD-20261121-ABC123",
            orderStatus: OrderStatus.PENDING_CONFIRMATION,
            paymentMethod: PaymentMethod.COD,
            paymentStatus: PaymentStatus.PENDING,
            receiverName: "Nguyen Van An",
            receiverPhone: "0912345678",
            shippingAddress: "12 Nguyen Van Linh, Quận 7, TP. Hồ Chí Minh",
            shippingDistanceKm: "13.00",
            shippingFee: 65_000,
            subtotal: 120_000,
            discountAmount: 0,
            loyaltyPointsUsed: 0,
            totalAmount: 185_000,
            createdAt,
            updatedAt,
          },
        ],
        [
          {
            id: "019fa8bc-8f4d-7000-b366-e691f45cfb51",
            orderId,
            productId: productAId,
            quantity: "1.50",
            unitPrice: 80_000,
            productName: "Ca chua bi",
            productSlug: "ca-chua-bi",
            productImageUrls: [
              "https://res.cloudinary.com/greenroots-dev/image/upload/v1/products/ca-chua.webp",
            ],
            unit: "kg",
          },
        ],
      ]);

      const result = await service.listMyOrders(userId, {
        page: 1,
        limit: 20,
        status: OrderStatus.PENDING_CONFIRMATION,
        sort: "totalAmount:desc",
      });

      expect(result.meta.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        id: orderId,
        orderCode: "ORD-20261121-ABC123",
        orderStatus: OrderStatus.PENDING_CONFIRMATION,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PENDING,
        receiverName: "Nguyen Van An",
        receiverPhone: "0912345678",
        shippingAddress: "12 Nguyen Van Linh, Quận 7, TP. Hồ Chí Minh",
        shippingDistanceKm: 13,
        shippingFeeVnd: 65_000,
        subtotalVnd: 120_000,
        discountAmountVnd: 0,
        loyaltyPointsUsed: 0,
        totalAmountVnd: 185_000,
        items: [
          {
            id: "019fa8bc-8f4d-7000-b366-e691f45cfb51",
            productId: productAId,
            productName: "Ca chua bi",
            productSlug: "ca-chua-bi",
            productImageUrl:
              "https://res.cloudinary.com/greenroots-dev/image/upload/v1/products/ca-chua.webp",
            unit: "kg",
            quantity: 1.5,
            unitPriceVnd: 80_000,
            lineTotalVnd: 120_000,
          },
        ],
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      });
    });

    it("supports ascending createdAt and totalAmount sort options", async () => {
      const createdAt = new Date("2026-11-21T03:00:00.000Z");
      const orderRow = {
        id: "019fa8bc-8f4d-7000-b366-e691f45cfb50",
        orderCode: "ORD-20261121-ASC001",
        orderStatus: OrderStatus.PENDING_CONFIRMATION,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PENDING,
        receiverName: "Nguyen Van An",
        receiverPhone: "0912345678",
        shippingAddress: "12 Nguyen Van Linh, Quận 7, TP. Hồ Chí Minh",
        shippingDistanceKm: "5.00",
        shippingFee: 15_000,
        subtotal: 150_000,
        discountAmount: 0,
        loyaltyPointsUsed: 0,
        totalAmount: 165_000,
        createdAt,
        updatedAt: createdAt,
      };

      for (const sort of ["createdAt:asc", "totalAmount:asc"] as const) {
        mockDb.setSelectResultsQueue([
          [{ id: userId, status: UserStatus.ACTIVE, rewardPoints: 0 }],
          [{ total: 1 }],
          [orderRow],
          [],
        ]);

        const res = await service.listMyOrders(userId, {
          page: 1,
          limit: 20,
          sort,
        });
        expect(res.items).toHaveLength(1);
        expect(res.items[0]?.items).toEqual([]);
      }
    });

    it("accepts grouped statuses array filter", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: userId, status: UserStatus.ACTIVE, rewardPoints: 0 }],
        [{ total: 0 }],
      ]);

      const res = await service.listMyOrders(userId, {
        page: 1,
        limit: 20,
        sort: "createdAt:desc",
        statuses: [
          OrderStatus.PENDING_PAYMENT,
          OrderStatus.PENDING_CONFIRMATION,
        ],
      });

      expect(res.meta.total).toBe(0);
      expect(res.items).toEqual([]);
    });
  });

  describe("getMyOrderById", () => {
    // Invariant: INV-ORD-7
    it("throws not-found exception when the order is missing or owned by another customer", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: userId, status: UserStatus.ACTIVE, rewardPoints: 0 }],
        [],
      ]);

      let caught: unknown;
      try {
        await service.getMyOrderById(
          userId,
          "019fa8bc-8f4d-7000-b366-e691f45cfb50",
        );
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect(
        (caught as NotFoundException).getResponse() as { code: string },
      ).toMatchObject({ code: API_ERROR_CODES.ORDER_NOT_FOUND });
    });

    it("returns null productImageUrl when product imageUrls is empty or null", async () => {
      const orderId = "019fa8bc-8f4d-7000-b366-e691f45cfb50";
      const createdAt = new Date("2026-11-21T03:00:00.000Z");

      mockDb.setSelectResultsQueue([
        [{ id: userId, status: UserStatus.ACTIVE, rewardPoints: 0 }],
        [
          {
            id: orderId,
            orderCode: "ORD-20261121-ABC123",
            orderStatus: OrderStatus.PACKING,
            paymentMethod: PaymentMethod.SUBSCRIPTION,
            paymentStatus: PaymentStatus.PAID,
            receiverName: "Nguyen Van An",
            receiverPhone: "0912345678",
            shippingAddress: "12 Nguyen Van Linh, Quận 7, TP. Hồ Chí Minh",
            shippingDistanceKm: "5.50",
            shippingFee: 0,
            subtotal: 150_000,
            discountAmount: 0,
            loyaltyPointsUsed: 0,
            totalAmount: 150_000,
            createdAt,
            updatedAt: createdAt,
          },
        ],
        [
          {
            id: "019fa8bc-8f4d-7000-b366-e691f45cfb51",
            orderId,
            productId: productAId,
            quantity: "2.00",
            unitPrice: 75_000,
            productName: "Ca chua bi",
            productSlug: "ca-chua-bi",
            productImageUrls: [],
            unit: "kg",
          },
        ],
      ]);

      const order = await service.getMyOrderById(userId, orderId);
      expect(order.paymentMethod).toBe(PaymentMethod.SUBSCRIPTION);
      expect(order.items[0]?.productImageUrl).toBeNull();
      expect(order.items[0]?.lineTotalVnd).toBe(150_000);
    });
  });

  describe("confirmOrder", () => {
    const orderId = "019fa8bc-8f4d-7000-b366-e691f45cfb50";
    const itemAId = "019fa8bc-8f4d-7000-b366-e691f45cfb51";
    const batch1Id = "019fa8bc-8f4d-7000-b366-e691f45cfb61";

    function buildOrderRow(
      overrides: Partial<{
        orderStatus: OrderStatus;
        paymentMethod: PaymentMethod;
        paymentStatus: PaymentStatus;
        loyaltyPointsUsed: number;
      }> = {},
    ) {
      const now = new Date("2026-11-21T03:00:00.000Z");
      return {
        id: orderId,
        customerId: userId,
        orderCode: "ORD-20261121-ABC123",
        orderStatus: overrides.orderStatus ?? OrderStatus.PENDING_CONFIRMATION,
        paymentMethod: overrides.paymentMethod ?? PaymentMethod.COD,
        paymentStatus: overrides.paymentStatus ?? PaymentStatus.PENDING,
        receiverName: "Nguyen Van An",
        receiverPhone: "0912345678",
        shippingAddress: "12 Nguyen Van Linh, Quận 7, TP. Hồ Chí Minh",
        shippingDistanceKm: "5.00",
        shippingFee: 15_000,
        subtotal: 160_000,
        discountAmount: overrides.loyaltyPointsUsed ?? 0,
        loyaltyPointsUsed: overrides.loyaltyPointsUsed ?? 0,
        totalAmount: 175_000 - (overrides.loyaltyPointsUsed ?? 0),
        createdAt: now,
        updatedAt: now,
      };
    }

    // Invariant: INV-ORD-12
    it("returns active allocations idempotently when order is already confirmed without touching stock", async () => {
      const exp = new Date("2026-11-23T00:00:00.000Z");
      const confirmedOrder = buildOrderRow({
        orderStatus: OrderStatus.CONFIRMED,
      });

      mockDb.setSelectResultsQueue([
        [confirmedOrder],
        [
          {
            id: itemAId,
            orderId,
            productId: productAId,
            quantity: "2.00",
            unitPrice: 80_000,
            productName: "Ca chua bi",
            productSlug: "ca-chua-bi",
            productImageUrls: null,
            unit: "kg",
          },
        ],
        [
          {
            id: "019fa8bc-8f4d-7000-b366-e691f45cfb71",
            orderItemId: itemAId,
            batchId: batch1Id,
            batchCode: "BATCH-20261121-TOMATO-AAAAAA",
            expirationDate: exp,
            allocatedQuantity: "2.00",
            releasedAt: null,
          },
        ],
      ]);

      const result = await service.confirmOrder(orderId);
      expect(result.orderStatus).toBe(OrderStatus.CONFIRMED);
      expect(result.customerId).toBe(userId);
      expect(result.items[0]?.allocations).toHaveLength(1);
      expect(result.items[0]?.allocations[0]?.releasedAt).toBeNull();
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    // Invariant: INV-ORD-12
    it("rejects confirmation when order is in packing, pending_payment, or cancelled", async () => {
      for (const status of [
        OrderStatus.PENDING_PAYMENT,
        OrderStatus.PACKING,
        OrderStatus.CANCELLED,
      ]) {
        mockDb.setSelectResultsQueue([
          [buildOrderRow({ orderStatus: status })],
        ]);

        let caught: unknown;
        try {
          await service.confirmOrder(orderId);
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(ConflictException);
        expect(
          (caught as ConflictException).getResponse() as { code: string },
        ).toMatchObject({
          code: API_ERROR_CODES.ORDER_INVALID_STATUS_TRANSITION,
        });
      }
    });

    // Invariant: INV-ORD-18
    it("confirms pending_confirmation order with active allocations and clears reservationExpiresAt", async () => {
      const pendingOrder = buildOrderRow();
      const confirmedOrder = buildOrderRow({
        orderStatus: OrderStatus.CONFIRMED,
      });
      const exp = new Date("2026-11-23T00:00:00.000Z");
      const orderUpdates: Record<string, unknown>[] = [];

      const origUpdate = mockDb.update.bind(mockDb);
      mockDb.update = ((table: unknown) => ({
        set: (vals: Record<string, unknown>) => {
          orderUpdates.push(vals);
          return origUpdate(table as never).set(vals as never);
        },
      })) as unknown as typeof mockDb.update;

      mockDb.setSelectResultsQueue([
        [pendingOrder],
        [{ id: "019fa8bc-8f4d-7000-b366-e691f45cfb71" }],
        [confirmedOrder],
        [
          {
            id: itemAId,
            orderId,
            productId: productAId,
            quantity: "2.00",
            unitPrice: 80_000,
            productName: "Ca chua bi",
            productSlug: "ca-chua-bi",
            productImageUrls: null,
            unit: "kg",
          },
        ],
        [
          {
            id: "019fa8bc-8f4d-7000-b366-e691f45cfb71",
            orderItemId: itemAId,
            batchId: batch1Id,
            batchCode: "BATCH-20261121-TOMATO-AAAAAA",
            expirationDate: exp,
            allocatedQuantity: "2.00",
            releasedAt: null,
          },
        ],
      ]);

      const result = await service.confirmOrder(orderId);
      expect(result.orderStatus).toBe(OrderStatus.CONFIRMED);
      expect(result.items[0]?.allocations).toHaveLength(1);
      expect(orderUpdates).toHaveLength(1);
      expect(orderUpdates[0]).toMatchObject({
        orderStatus: OrderStatus.CONFIRMED,
        reservationExpiresAt: null,
      });
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    // Invariant: INV-ORD-18
    it("rejects confirmation when pending_confirmation order has no active batch allocations", async () => {
      mockDb.setSelectResultsQueue([[buildOrderRow()], []]);

      let caught: unknown;
      try {
        await service.confirmOrder(orderId);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      expect(
        (caught as ConflictException).getResponse() as { code: string },
      ).toMatchObject({
        code: API_ERROR_CODES.ORDER_INVALID_STATUS_TRANSITION,
      });
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe("updateOrderStatus", () => {
    const orderId = "019fa8bc-8f4d-7000-b366-e691f45cfb50";

    it("rejects unknown keys or invalid status on UpdateOrderStatusRequestDto", () => {
      expect(
        updateOrderStatusRequestSchema.safeParse({
          status: OrderStatus.PACKING,
          extra: true,
        }).success,
      ).toBe(false);
      expect(
        updateOrderStatusRequestSchema.safeParse({
          status: "processing",
        }).success,
      ).toBe(false);
    });

    // Invariant: INV-ORD-13
    it("rejects direct transition into confirmed or backward and terminal FSM transitions", async () => {
      const invalidCases: [OrderStatus, OrderStatus][] = [
        [OrderStatus.PENDING_CONFIRMATION, OrderStatus.CONFIRMED],
        [OrderStatus.PENDING_CONFIRMATION, OrderStatus.PACKING],
        [OrderStatus.CONFIRMED, OrderStatus.CONFIRMED],
        [OrderStatus.PACKING, OrderStatus.DELIVERED],
        [OrderStatus.SHIPPING, OrderStatus.CANCELLED],
        [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
        [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
        [OrderStatus.CANCELLED, OrderStatus.PACKING],
      ];

      for (const [current, target] of invalidCases) {
        mockDb.setSelectResultsQueue([
          [
            {
              id: orderId,
              customerId: userId,
              orderCode: "ORD-20261121-ABC123",
              orderStatus: current,
              paymentMethod: PaymentMethod.COD,
              paymentStatus: PaymentStatus.PENDING,
              receiverName: "Nguyen Van An",
              receiverPhone: "0912345678",
              shippingAddress: "12 Nguyen Van Linh, Quận 7, TP. Hồ Chí Minh",
              shippingDistanceKm: "5.00",
              shippingFee: 15_000,
              subtotal: 160_000,
              discountAmount: 0,
              loyaltyPointsUsed: 0,
              totalAmount: 175_000,
              createdAt: new Date("2026-11-21T03:00:00.000Z"),
              updatedAt: new Date("2026-11-21T03:00:00.000Z"),
            },
          ],
        ]);

        let caught: unknown;
        try {
          await service.updateOrderStatus(orderId, target);
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(UnprocessableEntityException);
        expect(
          (caught as UnprocessableEntityException).getResponse() as {
            code: string;
          },
        ).toMatchObject({
          code: API_ERROR_CODES.ORDER_INVALID_STATUS_TRANSITION,
        });
      }
    });

    // Invariant: INV-ORD-15
    it("rejects cancelling a PAID or subscription order", async () => {
      mockDb.setSelectResultsQueue([
        [
          {
            id: orderId,
            customerId: userId,
            orderCode: "ORD-20261121-PAYOS1",
            orderStatus: OrderStatus.CONFIRMED,
            paymentMethod: PaymentMethod.PAYOS,
            paymentStatus: PaymentStatus.PAID,
            receiverName: "Nguyen Van An",
            receiverPhone: "0912345678",
            shippingAddress: "12 Nguyen Van Linh, Quận 7, TP. Hồ Chí Minh",
            shippingDistanceKm: "5.00",
            shippingFee: 15_000,
            subtotal: 160_000,
            discountAmount: 0,
            loyaltyPointsUsed: 0,
            totalAmount: 175_000,
            createdAt: new Date("2026-11-21T03:00:00.000Z"),
            updatedAt: new Date("2026-11-21T03:00:00.000Z"),
          },
        ],
      ]);

      let caught: unknown;
      try {
        await service.updateOrderStatus(orderId, OrderStatus.CANCELLED);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(UnprocessableEntityException);
      expect(
        (caught as UnprocessableEntityException).getResponse() as {
          code: string;
        },
      ).toMatchObject({
        code: API_ERROR_CODES.ORDER_PAID_CANCELLATION_FORBIDDEN,
      });
    });

    // Invariant: INV-ORD-14
    it("re-evaluates restored batch status as expired, near_expiry, or in_stock when cancelling an allocated order", async () => {
      const nowMs = Date.now();
      const expiredAt = new Date(nowMs - 60_000);
      const nearExpiryAt = new Date(nowMs + 12 * 3_600_000);
      const freshAt = new Date(nowMs + 96 * 3_600_000);
      const batchUpdates: Record<string, unknown>[] = [];

      const origUpdate = mockDb.update.bind(mockDb);
      mockDb.update = ((table: unknown) => ({
        set: (vals: Record<string, unknown>) => {
          batchUpdates.push(vals);
          return origUpdate(table as never).set(vals as never);
        },
      })) as unknown as typeof mockDb.update;

      const confirmedOrder = {
        id: orderId,
        customerId: userId,
        orderCode: "ORD-20261121-ABC123",
        orderStatus: OrderStatus.CONFIRMED,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PENDING,
        receiverName: "Nguyen Van An",
        receiverPhone: "0912345678",
        shippingAddress: "12 Nguyen Van Linh, Quận 7, TP. Hồ Chí Minh",
        shippingDistanceKm: "5.00",
        shippingFee: 15_000,
        subtotal: 160_000,
        discountAmount: 0,
        loyaltyPointsUsed: 0,
        totalAmount: 175_000,
        createdAt: new Date(nowMs - 3_600_000),
        updatedAt: new Date(nowMs - 3_600_000),
      };

      const cancelledOrder = {
        ...confirmedOrder,
        orderStatus: OrderStatus.CANCELLED,
        paymentStatus: PaymentStatus.CANCELLED,
      };

      mockDb.setSelectResultsQueue([
        [confirmedOrder],
        [
          {
            id: "alloc-1",
            batchId: "batch-1",
            allocatedQuantity: "1.00",
          },
          {
            id: "alloc-2",
            batchId: "batch-2",
            allocatedQuantity: "2.00",
          },
          {
            id: "alloc-3",
            batchId: "batch-3",
            allocatedQuantity: "3.00",
          },
        ],
        [
          {
            id: "batch-1",
            availableQuantity: "0.00",
            expirationDate: expiredAt,
            status: BatchStatus.SOLD_OUT,
          },
          {
            id: "batch-2",
            availableQuantity: "0.00",
            expirationDate: nearExpiryAt,
            status: BatchStatus.SOLD_OUT,
          },
          {
            id: "batch-3",
            availableQuantity: "1.00",
            expirationDate: freshAt,
            status: BatchStatus.IN_STOCK,
          },
        ],
        [cancelledOrder],
        [],
      ]);

      const result = await service.updateOrderStatus(
        orderId,
        OrderStatus.CANCELLED,
      );
      expect(result.orderStatus).toBe(OrderStatus.CANCELLED);
      expect(result.paymentStatus).toBe(PaymentStatus.CANCELLED);

      expect(batchUpdates[0]).toMatchObject({
        availableQuantity: "1.00",
        status: BatchStatus.EXPIRED,
      });
      expect(batchUpdates[1]).toMatchObject({
        availableQuantity: "2.00",
        status: BatchStatus.NEAR_EXPIRY,
      });
      expect(batchUpdates[2]).toMatchObject({
        availableQuantity: "4.00",
        status: BatchStatus.IN_STOCK,
      });
    });

    // Invariant: INV-ORD-18
    it("releases active batch allocations and clears reservationExpiresAt when cancelling a pending_confirmation order", async () => {
      const nowMs = Date.now();
      const freshAt = new Date(nowMs + 96 * 3_600_000);
      const batchUpdates: Record<string, unknown>[] = [];
      const orderUpdates: Record<string, unknown>[] = [];

      const origUpdate = mockDb.update.bind(mockDb);
      mockDb.update = ((table: unknown) => ({
        set: (vals: Record<string, unknown>) => {
          if (table === batches) {
            batchUpdates.push(vals);
          }
          if (table === orders) {
            orderUpdates.push(vals);
          }
          return origUpdate(table as never).set(vals as never);
        },
      })) as unknown as typeof mockDb.update;

      const pendingOrder = {
        id: orderId,
        customerId: userId,
        orderCode: "ORD-20261121-ABC123",
        orderStatus: OrderStatus.PENDING_CONFIRMATION,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PENDING,
        receiverName: "Nguyen Van An",
        receiverPhone: "0912345678",
        shippingAddress: "12 Nguyen Van Linh, Quận 7, TP. Hồ Chí Minh",
        shippingDistanceKm: "5.00",
        shippingFee: 15_000,
        subtotal: 160_000,
        discountAmount: 0,
        loyaltyPointsUsed: 0,
        totalAmount: 175_000,
        createdAt: new Date(nowMs - 3_600_000),
        updatedAt: new Date(nowMs - 3_600_000),
      };

      const cancelledOrder = {
        ...pendingOrder,
        orderStatus: OrderStatus.CANCELLED,
        paymentStatus: PaymentStatus.CANCELLED,
      };

      mockDb.setSelectResultsQueue([
        [pendingOrder],
        [
          {
            id: "alloc-1",
            batchId: "batch-1",
            allocatedQuantity: "2.00",
          },
        ],
        [
          {
            id: "batch-1",
            availableQuantity: "0.00",
            expirationDate: freshAt,
            status: BatchStatus.SOLD_OUT,
          },
        ],
        [cancelledOrder],
        [],
      ]);

      const result = await service.updateOrderStatus(
        orderId,
        OrderStatus.CANCELLED,
      );

      expect(result.orderStatus).toBe(OrderStatus.CANCELLED);
      expect(batchUpdates[0]).toMatchObject({
        availableQuantity: "2.00",
        status: BatchStatus.IN_STOCK,
      });
      expect(orderUpdates[0]).toMatchObject({
        orderStatus: OrderStatus.CANCELLED,
        paymentStatus: PaymentStatus.CANCELLED,
        reservationExpiresAt: null,
      });
    });
  });

  describe("getOrderPickList", () => {
    const orderId = "019fa8bc-8f4d-7000-b366-e691f45cfb50";
    const batch1Id = "019fa8bc-8f4d-7000-b366-e691f45cfb61";
    const batch2Id = "019fa8bc-8f4d-7000-b366-e691f45cfb62";

    // Invariant: INV-ORD-18, INV-ORD-19
    it("groups active allocations by batchId in FEFO order, sums duplicate product lines in cents, and marks expired batches", async () => {
      const nowMs = Date.now();
      const expiredAt = new Date(nowMs - 60_000);
      const freshAt = new Date(nowMs + 48 * 3_600_000);

      mockDb.setSelectResultsQueue([
        [
          {
            orderId,
            orderCode: "ORD-20261121-PICK01",
            orderStatus: OrderStatus.CONFIRMED,
            allocationId: "alloc-1",
            allocatedQuantity: "1.25",
            batchId: batch1Id,
            batchCode: "BATCH-EXP-01",
            expirationDate: expiredAt,
            batchStatus: BatchStatus.NEAR_EXPIRY,
            productId: productAId,
            productName: "Cà chua bi hữu cơ",
            unit: "kg",
          },
          {
            orderId,
            orderCode: "ORD-20261121-PICK01",
            orderStatus: OrderStatus.CONFIRMED,
            allocationId: "alloc-2",
            allocatedQuantity: "0.75",
            batchId: batch1Id,
            batchCode: "BATCH-EXP-01",
            expirationDate: expiredAt,
            batchStatus: BatchStatus.NEAR_EXPIRY,
            productId: productAId,
            productName: "Cà chua bi hữu cơ",
            unit: "kg",
          },
          {
            orderId,
            orderCode: "ORD-20261121-PICK01",
            orderStatus: OrderStatus.CONFIRMED,
            allocationId: "alloc-3",
            allocatedQuantity: "3.50",
            batchId: batch2Id,
            batchCode: "BATCH-FRESH-02",
            expirationDate: freshAt,
            batchStatus: BatchStatus.IN_STOCK,
            productId: productBId,
            productName: "Cải bó xôi hữu cơ",
            unit: "kg",
          },
        ],
      ]);

      const pickList = await service.getOrderPickList(orderId);

      expect(pickList.orderId).toBe(orderId);
      expect(pickList.orderCode).toBe("ORD-20261121-PICK01");
      expect(pickList.orderStatus).toBe(OrderStatus.CONFIRMED);
      expect(typeof pickList.generatedAt).toBe("string");
      expect(pickList.batches).toEqual([
        {
          batchId: batch1Id,
          batchCode: "BATCH-EXP-01",
          expirationDate: expiredAt.toISOString(),
          batchStatus: BatchStatus.NEAR_EXPIRY,
          isExpired: true,
          productId: productAId,
          productName: "Cà chua bi hữu cơ",
          unit: "kg",
          allocatedQuantity: 2,
        },
        {
          batchId: batch2Id,
          batchCode: "BATCH-FRESH-02",
          expirationDate: freshAt.toISOString(),
          batchStatus: BatchStatus.IN_STOCK,
          isExpired: false,
          productId: productBId,
          productName: "Cải bó xôi hữu cơ",
          unit: "kg",
          allocatedQuantity: 3.5,
        },
      ]);
      expect(Object.keys(pickList).sort()).toEqual([
        "batches",
        "generatedAt",
        "orderCode",
        "orderId",
        "orderStatus",
      ]);
    });

    // Invariant: INV-ORD-17
    it("throws not found when the order does not exist", async () => {
      mockDb.setSelectResultsQueue([[]]);

      let caught: unknown;
      try {
        await service.getOrderPickList(orderId);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect(
        (caught as NotFoundException).getResponse() as { code: string },
      ).toMatchObject({
        code: API_ERROR_CODES.ORDER_NOT_FOUND,
      });
    });

    // Invariant: INV-ORD-17
    it("rejects orders outside confirmed, packing, and shipping statuses", async () => {
      for (const disallowedStatus of [
        OrderStatus.PENDING_PAYMENT,
        OrderStatus.PENDING_CONFIRMATION,
        OrderStatus.DELIVERED,
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED,
      ]) {
        mockDb.setSelectResultsQueue([
          [
            {
              orderId,
              orderCode: "ORD-20261121-PICK02",
              orderStatus: disallowedStatus,
              allocationId: null,
              allocatedQuantity: null,
              batchId: null,
              batchCode: null,
              expirationDate: null,
              batchStatus: null,
              productId: null,
              productName: null,
              unit: null,
            },
          ],
        ]);

        let caught: unknown;
        try {
          await service.getOrderPickList(orderId);
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(ConflictException);
        expect(
          (caught as ConflictException).getResponse() as { code: string },
        ).toMatchObject({
          code: API_ERROR_CODES.ORDER_PICK_LIST_STATUS_INVALID,
        });
      }
    });

    // Invariant: INV-ORD-17
    it("rejects pickable orders when active allocations are missing", async () => {
      mockDb.setSelectResultsQueue([
        [
          {
            orderId,
            orderCode: "ORD-20261121-PICK03",
            orderStatus: OrderStatus.CONFIRMED,
            allocationId: null,
            allocatedQuantity: null,
            batchId: null,
            batchCode: null,
            expirationDate: null,
            batchStatus: null,
            productId: null,
            productName: null,
            unit: null,
          },
        ],
      ]);

      let caught: unknown;
      try {
        await service.getOrderPickList(orderId);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      expect(
        (caught as ConflictException).getResponse() as { code: string },
      ).toMatchObject({
        code: API_ERROR_CODES.ORDER_ACTIVE_ALLOCATIONS_MISSING,
      });
    });
  });

  describe("cancelMyOrder", () => {
    const orderId = "019fa8bc-8f4d-7000-b366-e691f45cfb50";
    const otherUserId = "019fa8bc-8f4d-7000-b366-e691f45cfb92";

    const buildOrderRow = (overrides?: Partial<Record<string, unknown>>) => {
      const now = new Date("2026-11-21T03:00:00.000Z");
      return {
        id: orderId,
        customerId: userId,
        orderCode: "ORD-20261121-CAN01",
        orderStatus: OrderStatus.PENDING_CONFIRMATION,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PENDING,
        receiverName: "Nguyen Van An",
        receiverPhone: "0912345678",
        shippingAddress: "12 Nguyen Van Linh, Quận 7, TP. Hồ Chí Minh",
        shippingDistanceKm: "5.00",
        shippingFee: 15_000,
        subtotal: 160_000,
        discountAmount: 20_000,
        loyaltyPointsUsed: 20_000,
        totalAmount: 155_000,
        createdAt: now,
        updatedAt: now,
        ...overrides,
      };
    };

    // Invariant: INV-ORD-21
    it("cancels an owned pending_confirmation order, releases allocations, refunds loyalty, and returns closed OrderProjection", async () => {
      const nowMs = Date.now();
      const freshAt = new Date(nowMs + 96 * 3_600_000);
      const batchUpdates: Record<string, unknown>[] = [];
      const orderUpdates: Record<string, unknown>[] = [];
      const userUpdates: Record<string, unknown>[] = [];

      const origUpdate = mockDb.update.bind(mockDb);
      mockDb.update = ((table: unknown) => ({
        set: (vals: Record<string, unknown>) => {
          if (table === batches) {
            batchUpdates.push(vals);
          } else if (table === orders) {
            orderUpdates.push(vals);
          } else {
            userUpdates.push(vals);
          }
          return origUpdate(table as never).set(vals as never);
        },
      })) as unknown as typeof mockDb.update;

      const pendingOrder = buildOrderRow();
      const cancelledOrder = buildOrderRow({
        orderStatus: OrderStatus.CANCELLED,
        paymentStatus: PaymentStatus.CANCELLED,
      });

      mockDb.setSelectResultsQueue([
        [pendingOrder],
        [
          {
            id: "alloc-1",
            batchId: "batch-1",
            allocatedQuantity: "2.00",
          },
        ],
        [
          {
            id: "batch-1",
            availableQuantity: "0.00",
            expirationDate: freshAt,
            status: BatchStatus.SOLD_OUT,
          },
        ],
        [{ id: userId }],
        [cancelledOrder],
        [
          {
            id: "item-1",
            orderId,
            productId: productAId,
            quantity: "2.00",
            unitPrice: 80_000,
            productName: "Cà chua bi hữu cơ",
            productSlug: "ca-chua-bi-huu-co",
            productImageUrls: ["https://cdn.example.com/tomato.jpg"],
            unit: "kg",
          },
        ],
      ]);

      const result = await service.cancelMyOrder(userId, orderId);

      expect(result.id).toBe(orderId);
      expect(result.orderStatus).toBe(OrderStatus.CANCELLED);
      expect(result.paymentStatus).toBe(PaymentStatus.CANCELLED);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).not.toHaveProperty("allocations");
      expect(result.items[0]).not.toHaveProperty("batchCode");
      expect(result).not.toHaveProperty("customerId");

      expect(batchUpdates[0]).toMatchObject({
        availableQuantity: "2.00",
        status: BatchStatus.IN_STOCK,
      });
      expect(orderUpdates[0]).toMatchObject({
        orderStatus: OrderStatus.CANCELLED,
        paymentStatus: PaymentStatus.CANCELLED,
        reservationExpiresAt: null,
      });
      expect(userUpdates.length).toBeGreaterThanOrEqual(1);
    });

    // Invariant: INV-ORD-21
    it("rejects cancellation when the order is missing or belongs to another customer", async () => {
      for (const queued of [[], [buildOrderRow({ customerId: otherUserId })]]) {
        mockDb.setSelectResultsQueue([queued]);

        let caught: unknown;
        try {
          await service.cancelMyOrder(userId, orderId);
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(NotFoundException);
        expect(
          (caught as NotFoundException).getResponse() as { code: string },
        ).toMatchObject({
          code: API_ERROR_CODES.ORDER_NOT_FOUND,
        });
      }
    });

    // Invariant: INV-ORD-21
    it("rejects cancelling a paid or subscription order", async () => {
      for (const row of [
        buildOrderRow({
          orderStatus: OrderStatus.PENDING_CONFIRMATION,
          paymentStatus: PaymentStatus.PAID,
        }),
        buildOrderRow({
          orderStatus: OrderStatus.PENDING_CONFIRMATION,
          paymentMethod: PaymentMethod.SUBSCRIPTION,
          paymentStatus: PaymentStatus.PENDING,
        }),
      ]) {
        mockDb.setSelectResultsQueue([[row]]);

        let caught: unknown;
        try {
          await service.cancelMyOrder(userId, orderId);
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(UnprocessableEntityException);
        expect(
          (caught as UnprocessableEntityException).getResponse() as {
            code: string;
          },
        ).toMatchObject({
          code: API_ERROR_CODES.ORDER_PAID_CANCELLATION_FORBIDDEN,
        });
      }
    });

    // Invariant: INV-ORD-21
    it("rejects cancelling when the order is confirmed or in a later status", async () => {
      for (const disallowedStatus of [
        OrderStatus.CONFIRMED,
        OrderStatus.PACKING,
        OrderStatus.SHIPPING,
        OrderStatus.DELIVERED,
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED,
      ]) {
        mockDb.setSelectResultsQueue([
          [buildOrderRow({ orderStatus: disallowedStatus })],
        ]);

        let caught: unknown;
        try {
          await service.cancelMyOrder(userId, orderId);
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(UnprocessableEntityException);
        expect(
          (caught as UnprocessableEntityException).getResponse() as {
            code: string;
          },
        ).toMatchObject({
          code: API_ERROR_CODES.ORDER_INVALID_STATUS_TRANSITION,
        });
      }
    });
  });

  describe("expireStaleReservations", () => {
    const orderId = "019fa8bc-8f4d-7000-b366-e691f45cfb80";

    // Invariant: INV-ORD-22
    it("returns zero without mutating records when no reservations have expired", async () => {
      mockDb.setSelectResultsQueue([[]]);

      const expiredCount = await service.expireStaleReservations(
        new Date("2026-11-25T10:00:00.000Z"),
      );

      expect(expiredCount).toBe(0);
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    // Invariant: INV-ORD-19, INV-ORD-22
    it("cancels expired pending_confirmation orders, soft-releases allocations, refunds loyalty points, and cancels pending payments", async () => {
      const now = new Date("2026-11-25T10:00:00.000Z");
      const freshAt = new Date(now.getTime() + 96 * 3_600_000);
      const batchUpdates: Record<string, unknown>[] = [];
      const allocationUpdates: Record<string, unknown>[] = [];
      const userUpdates: Record<string, unknown>[] = [];
      const orderUpdates: Record<string, unknown>[] = [];
      const paymentUpdates: Record<string, unknown>[] = [];

      const origUpdate = mockDb.update.bind(mockDb);
      mockDb.update = ((table: unknown) => ({
        set: (vals: Record<string, unknown>) => {
          if (table === batches) batchUpdates.push(vals);
          if (table === batchAllocations) allocationUpdates.push(vals);
          if (table === users) userUpdates.push(vals);
          if (table === orders) orderUpdates.push(vals);
          if (table === payments) paymentUpdates.push(vals);
          return origUpdate(table as never).set(vals as never);
        },
      })) as unknown as typeof mockDb.update;

      mockDb.setSelectResultsQueue([
        [
          {
            id: orderId,
            customerId: userId,
            paymentMethod: PaymentMethod.COD,
            paymentStatus: PaymentStatus.PENDING,
            orderStatus: OrderStatus.PENDING_CONFIRMATION,
            loyaltyPointsUsed: 100,
          },
        ],
        [
          {
            id: "alloc-1",
            batchId: "batch-1",
            allocatedQuantity: "2.00",
          },
        ],
        [
          {
            id: "batch-1",
            availableQuantity: "0.00",
            expirationDate: freshAt,
            status: BatchStatus.SOLD_OUT,
          },
        ],
        [{ id: userId }],
        [{ id: orderId, orderStatus: OrderStatus.CANCELLED }],
        [],
      ]);

      const expiredCount = await service.expireStaleReservations(now);

      expect(expiredCount).toBe(1);
      expect(batchUpdates).toHaveLength(1);
      expect(batchUpdates[0]).toMatchObject({
        availableQuantity: "2.00",
        status: BatchStatus.IN_STOCK,
        updatedAt: now,
      });
      expect(allocationUpdates).toHaveLength(1);
      expect(allocationUpdates[0]).toMatchObject({
        releasedAt: now,
      });
      expect(userUpdates).toHaveLength(1);
      expect(orderUpdates).toHaveLength(1);
      expect(orderUpdates[0]).toMatchObject({
        orderStatus: OrderStatus.CANCELLED,
        paymentStatus: PaymentStatus.CANCELLED,
        reservationExpiresAt: null,
        updatedAt: now,
      });
      expect(paymentUpdates).toHaveLength(1);
      expect(paymentUpdates[0]).toMatchObject({
        status: PaymentStatus.CANCELLED,
        updatedAt: now,
      });
    });

    // Invariant: INV-ORD-22
    it("cancels expired pending_payment orders without releasing allocations when order has no active allocations", async () => {
      const now = new Date("2026-11-25T10:00:00.000Z");
      const batchUpdates: Record<string, unknown>[] = [];
      const orderUpdates: Record<string, unknown>[] = [];
      const paymentUpdates: Record<string, unknown>[] = [];

      const origUpdate = mockDb.update.bind(mockDb);
      mockDb.update = ((table: unknown) => ({
        set: (vals: Record<string, unknown>) => {
          if (table === batches) batchUpdates.push(vals);
          if (table === orders) orderUpdates.push(vals);
          if (table === payments) paymentUpdates.push(vals);
          return origUpdate(table as never).set(vals as never);
        },
      })) as unknown as typeof mockDb.update;

      mockDb.setSelectResultsQueue([
        [
          {
            id: orderId,
            customerId: userId,
            paymentMethod: PaymentMethod.PAYOS,
            paymentStatus: PaymentStatus.PENDING,
            orderStatus: OrderStatus.PENDING_PAYMENT,
            loyaltyPointsUsed: 0,
          },
        ],
        [{ id: orderId, orderStatus: OrderStatus.CANCELLED }],
        [],
      ]);

      const expiredCount = await service.expireStaleReservations(now);

      expect(expiredCount).toBe(1);
      expect(batchUpdates).toHaveLength(0);
      expect(orderUpdates).toHaveLength(1);
      expect(orderUpdates[0]).toMatchObject({
        orderStatus: OrderStatus.CANCELLED,
        paymentStatus: PaymentStatus.CANCELLED,
        reservationExpiresAt: null,
        updatedAt: now,
      });
      expect(paymentUpdates).toHaveLength(1);
      expect(paymentUpdates[0]).toMatchObject({
        status: PaymentStatus.CANCELLED,
        updatedAt: now,
      });
    });
  });
});
