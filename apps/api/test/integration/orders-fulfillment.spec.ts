import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { eq, isNull, sql } from "drizzle-orm";
import {
  API_ERROR_CODES,
  BatchStatus,
  BUSINESS_RULES,
  HCMC_DISTRICTS,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  UserRole,
  WasteLogStatus,
} from "@greenroots/shared";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";
import { RedisService } from "@/common/services/redis.service";
import type { ApiResponse } from "@/common/utils/api-response.util";
import {
  batchAllocations,
  batches,
  orderItems,
  orders,
  payments,
  userAddresses,
  users,
  wasteLogs,
} from "@/database/schemas";
import {
  FARM_SETTINGS_CACHE_KEY,
  FARM_SETTINGS_INVALIDATED_AT_KEY,
} from "@/modules/farms/farms.constant";
import {
  createBatch,
  createCategory,
  createFarm,
  createPlot,
  createProduct,
  createSeason,
} from "../factories";
import type { components } from "../generated/api-schema";
import {
  cleanScopedRedisKeys,
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "../helpers/app.helper";
import {
  createAuthenticatedAdmin,
  createAuthenticatedUser,
} from "../helpers/auth.helper";

const QUAN_1 = HCMC_DISTRICTS.find((d) => d.code === "quan-1")!;

type StaffOrderResponse = components["schemas"]["StaffOrderDto"];
type OrderResponse = components["schemas"]["OrderDto"];

describe("Orders Fulfillment Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let jwtService: JwtService;
  let appRedisClient: ReturnType<RedisService["getClient"]>;

  let customerId: string;
  let customerHeader: { Authorization: string };
  let guestHeader: { Authorization: string };
  let salesHeader: { Authorization: string };
  let adminHeader: { Authorization: string };
  let farmStaffId: string;
  let farmStaffHeader: { Authorization: string };
  let superAdminHeader: { Authorization: string };

  let seasonId: string;
  let categoryId: string;
  let tomatoId: string;
  let spinachId: string;

  let orderCounter = 0;

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    jwtService = app.get(JwtService);
    appRedisClient = app.get(RedisService).getClient();
  }, 30000);

  beforeEach(async () => {
    orderCounter = 0;
    await setup.db.execute(
      sql`TRUNCATE TABLE "waste_logs", "payments", "batch_allocations", "order_items", "orders", "batches", "products", "categories", "seasons", "plots", "farms", "user_addresses", "users" CASCADE;`,
    );
    await cleanScopedRedisKeys(setup.redisClient);
    await appRedisClient
      .unlink(FARM_SETTINGS_CACHE_KEY, FARM_SETTINGS_INVALIDATED_AT_KEY)
      .catch(() => undefined);

    const [
      customerSession,
      guestSession,
      salesSession,
      adminSession,
      farmStaffSession,
      superAdminSession,
    ] = await Promise.all([
      createAuthenticatedUser(setup.db, jwtService, {
        role: UserRole.CUSTOMER,
        rewardPoints: 100_000,
      }),
      createAuthenticatedUser(setup.db, jwtService, {
        role: UserRole.GUEST,
      }),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.SALES),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.ADMIN),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.FARM_STAFF),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.SUPER_ADMIN),
    ]);

    customerId = customerSession.user.id;
    customerHeader = customerSession.authHeader;
    guestHeader = guestSession.authHeader;
    salesHeader = salesSession.authHeader;
    adminHeader = adminSession.authHeader;
    farmStaffId = farmStaffSession.user.id;
    farmStaffHeader = farmStaffSession.authHeader;
    superAdminHeader = superAdminSession.authHeader;

    const farm = await createFarm(setup.db);
    const plot = await createPlot(setup.db, { farmId: farm.id });
    const season = await createSeason(setup.db, { plotId: plot.id });
    seasonId = season.id;

    const category = await createCategory(setup.db);
    categoryId = category.id;

    const tomato = await createProduct(setup.db, {
      categoryId,
      name: "Cà chua bi hữu cơ",
      slug: "ca-chua-bi-fulfillment",
      basePrice: 80_000,
      salePrice: null,
      unit: "kg",
    });
    tomatoId = tomato.id;

    const spinach = await createProduct(setup.db, {
      categoryId,
      name: "Cải bó xôi hữu cơ",
      slug: "cai-bo-xoi-fulfillment",
      basePrice: 50_000,
      salePrice: null,
      unit: "kg",
    });
    spinachId = spinach.id;

    await setup.db.insert(userAddresses).values({
      userId: customerId,
      receiverName: "Trần Thị Khách",
      phoneNumber: "0912345678",
      streetAddress: "123 Lê Lợi",
      placeId: "mock_place_quan_1",
      ward: QUAN_1.name,
      city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
      latitude: QUAN_1.latitude.toFixed(8),
      longitude: QUAN_1.longitude.toFixed(8),
      isDefault: true,
    });
  });

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  async function seedOrder(params: {
    orderStatus?: OrderStatus;
    paymentMethod?: PaymentMethod;
    paymentStatus?: PaymentStatus;
    loyaltyPointsUsed?: number;
    items: { productId: string; quantity: string; unitPrice: number }[];
    allocations?: {
      itemIndex?: number;
      batchId: string;
      quantity: string;
      markSoldOut?: boolean;
    }[];
  }) {
    orderCounter += 1;
    const subtotal = params.items.reduce(
      (sum, item) =>
        sum +
        Math.round(
          (Math.round(Number(item.quantity) * 100) * item.unitPrice) / 100,
        ),
      0,
    );
    const loyaltyPointsUsed = params.loyaltyPointsUsed ?? 0;
    const shippingFee = 15_000;
    const totalAmount = subtotal - loyaltyPointsUsed + shippingFee;

    const [createdOrder] = await setup.db
      .insert(orders)
      .values({
        orderCode: `ORD-20261121-F${String(orderCounter).padStart(5, "0")}`,
        customerId,
        receiverName: "Trần Thị Khách",
        receiverPhone: "0912345678",
        shippingAddress: "12 Nguyễn Văn Linh, Quận 7, TP. Hồ Chí Minh",
        shippingDistanceKm: "5.00",
        shippingFee,
        subtotal,
        discountAmount: loyaltyPointsUsed,
        loyaltyPointsUsed,
        totalAmount,
        paymentMethod: params.paymentMethod ?? PaymentMethod.COD,
        paymentStatus: params.paymentStatus ?? PaymentStatus.PENDING,
        orderStatus: params.orderStatus ?? OrderStatus.PENDING_CONFIRMATION,
        deliveredAt:
          params.orderStatus === OrderStatus.DELIVERED ||
          params.orderStatus === OrderStatus.COMPLETED
            ? new Date()
            : null,
      })
      .returning();

    const createdItems = await setup.db
      .insert(orderItems)
      .values(
        params.items.map((item) => ({
          orderId: createdOrder!.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      )
      .returning();

    const paymentStatus = params.paymentStatus ?? PaymentStatus.PENDING;

    await setup.db.insert(payments).values({
      orderId: createdOrder!.id,
      amount: totalAmount,
      paymentMethod: params.paymentMethod ?? PaymentMethod.COD,
      status: paymentStatus,
      transactionType: PaymentTransactionType.PAYMENT,
      paidAt:
        paymentStatus === PaymentStatus.PAID ||
        paymentStatus === PaymentStatus.REFUNDED
          ? new Date()
          : null,
    });

    if (params.allocations && params.allocations.length > 0) {
      await setup.db.insert(batchAllocations).values(
        params.allocations.map((alloc) => ({
          orderItemId: createdItems[alloc.itemIndex ?? 0]!.id,
          batchId: alloc.batchId,
          allocatedQuantity: alloc.quantity,
        })),
      );
      for (const alloc of params.allocations) {
        await setup.db
          .update(batches)
          .set({
            availableQuantity: sql`${batches.availableQuantity} - ${alloc.quantity}::numeric`,
            ...(alloc.markSoldOut ? { status: BatchStatus.SOLD_OUT } : {}),
          })
          .where(eq(batches.id, alloc.batchId));
      }
    }

    return { order: createdOrder!, items: createdItems };
  }

  describe("POST /api/v1/orders/:id/confirm", () => {
    // Invariant: INV-ORD-11, INV-ORD-16, INV-ORD-18
    it("confirms an allocated pending order, clears reservation expiry, and keeps customer OrderDto closed", async () => {
      const now = Date.now();
      const expiredBatch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        batchCode: "BATCH-TOM-EXPIRED",
        harvestDate: new Date(now - 5 * 86_400_000),
        expirationDate: new Date(now - 60_000),
        initialQuantity: "10.00",
        availableQuantity: "10.00",
        status: BatchStatus.IN_STOCK,
      });
      const nearExpiryBatch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        batchCode: "BATCH-TOM-NEAR",
        harvestDate: new Date(now - 2 * 86_400_000),
        expirationDate: new Date(now + 12 * 3_600_000),
        initialQuantity: "2.00",
        availableQuantity: "2.00",
        status: BatchStatus.NEAR_EXPIRY,
      });
      const freshBatch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        batchCode: "BATCH-TOM-FRESH",
        harvestDate: new Date(now - 86_400_000),
        expirationDate: new Date(now + 72 * 3_600_000),
        initialQuantity: "5.00",
        availableQuantity: "5.00",
        status: BatchStatus.IN_STOCK,
      });

      const checkoutRes = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          items: [{ productId: tomatoId, quantity: 3.5 }],
        })
        .expect(201);
      const order = (checkoutRes.body as ApiResponse<OrderResponse>).data;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/confirm`)
        .set(salesHeader)
        .expect(200);

      const body = res.body as ApiResponse<StaffOrderResponse>;
      expect(body.data.orderStatus).toBe(OrderStatus.CONFIRMED);
      expect(body.data.customerId).toBe(customerId);
      expect(body.data.items[0]?.allocations).toHaveLength(2);
      expect(body.data.items[0]?.allocations[0]).toMatchObject({
        batchId: nearExpiryBatch.id,
        batchCode: "BATCH-TOM-NEAR",
        allocatedQuantity: 2,
        releasedAt: null,
      });
      expect(body.data.items[0]?.allocations[1]).toMatchObject({
        batchId: freshBatch.id,
        batchCode: "BATCH-TOM-FRESH",
        allocatedQuantity: 1.5,
        releasedAt: null,
      });

      const [orderRow] = await setup.db
        .select({ reservationExpiresAt: orders.reservationExpiresAt })
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(orderRow?.reservationExpiresAt).toBeNull();

      const [nearRow] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, nearExpiryBatch.id));
      const [freshRow] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, freshBatch.id));
      const [expiredRow] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, expiredBatch.id));

      expect(nearRow?.availableQuantity).toBe("0.00");
      expect(nearRow?.status).toBe(BatchStatus.SOLD_OUT);
      expect(freshRow?.availableQuantity).toBe("3.50");
      expect(freshRow?.status).toBe(BatchStatus.IN_STOCK);
      expect(expiredRow?.availableQuantity).toBe("10.00");

      const customerDetailRes = await request(app.getHttpServer())
        .get(`/api/v1/orders/${order.id}`)
        .set(customerHeader)
        .expect(200);
      const customerOrder = (
        customerDetailRes.body as ApiResponse<OrderResponse>
      ).data;
      expect("customerId" in customerOrder).toBe(false);
      expect("allocations" in (customerOrder.items[0] ?? {})).toBe(false);
    });

    // Invariant: INV-ORD-11, INV-ORD-18
    it("rejects confirmation when active allocations are missing and rolls back checkout when one item lacks sellable stock", async () => {
      const now = Date.now();
      const tomatoBatch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        harvestDate: new Date(now - 86_400_000),
        expirationDate: new Date(now + 48 * 3_600_000),
        initialQuantity: "5.00",
        availableQuantity: "5.00",
        status: BatchStatus.IN_STOCK,
      });
      const spinachBatch = await createBatch(setup.db, {
        seasonId,
        productId: spinachId,
        harvestDate: new Date(now - 86_400_000),
        expirationDate: new Date(now + 48 * 3_600_000),
        initialQuantity: "1.00",
        availableQuantity: "1.00",
        status: BatchStatus.IN_STOCK,
      });

      const checkoutRes = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          items: [
            { productId: tomatoId, quantity: 2 },
            { productId: spinachId, quantity: 3 },
          ],
        })
        .expect(409);

      const problem = checkoutRes.body as Rfc9457ProblemDetails;
      expect(problem.code).toBe(API_ERROR_CODES.INSUFFICIENT_STOCK);
      expect(problem.invalidParams[0]?.params).toMatchObject({
        productId: spinachId,
        requested: 3,
        available: 1,
      });

      const { order: unallocatedOrder } = await seedOrder({
        items: [{ productId: tomatoId, quantity: "2.00", unitPrice: 80_000 }],
      });

      const confirmRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${unallocatedOrder.id}/confirm`)
        .set(salesHeader)
        .expect(409);
      expect((confirmRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.ORDER_INVALID_STATUS_TRANSITION,
      );

      const [tBatch] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, tomatoBatch.id));
      const [sBatch] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, spinachBatch.id));
      const [orderRow] = await setup.db
        .select()
        .from(orders)
        .where(eq(orders.id, unallocatedOrder.id));
      const allocs = await setup.db.select().from(batchAllocations);

      expect(tBatch?.availableQuantity).toBe("5.00");
      expect(sBatch?.availableQuantity).toBe("1.00");
      expect(orderRow?.orderStatus).toBe(OrderStatus.PENDING_CONFIRMATION);
      expect(allocs).toHaveLength(0);
    });

    // Invariant: INV-ORD-12
    it("handles ten parallel confirmations for the same order idempotently without double-decrementing stock", async () => {
      const now = Date.now();
      const tomatoBatch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        harvestDate: new Date(now - 86_400_000),
        expirationDate: new Date(now + 48 * 3_600_000),
        initialQuantity: "10.00",
        availableQuantity: "10.00",
        status: BatchStatus.IN_STOCK,
      });

      const { order, items } = await seedOrder({
        items: [{ productId: tomatoId, quantity: "3.00", unitPrice: 80_000 }],
        allocations: [{ batchId: tomatoBatch.id, quantity: "3.00" }],
      });

      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(app.getHttpServer())
            .post(`/api/v1/orders/${order.id}/confirm`)
            .set(salesHeader),
        ),
      );

      for (const res of responses) {
        expect(res.status).toBe(200);
        const body = res.body as ApiResponse<StaffOrderResponse>;
        expect(body.data.orderStatus).toBe(OrderStatus.CONFIRMED);
        expect(body.data.items[0]?.allocations).toHaveLength(1);
        expect(body.data.items[0]?.allocations[0]?.allocatedQuantity).toBe(3);
      }

      const [batchRow] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, tomatoBatch.id));
      const allocs = await setup.db
        .select()
        .from(batchAllocations)
        .where(eq(batchAllocations.orderItemId, items[0]!.id));

      expect(batchRow?.availableQuantity).toBe("7.00");
      expect(allocs).toHaveLength(1);
    });

    // Invariant: INV-ORD-11, INV-ORD-19
    it("serializes ten parallel crossed-item checkouts without deadlocks or negative stock", async () => {
      const now = Date.now();
      const tomatoBatch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        harvestDate: new Date(now - 86_400_000),
        expirationDate: new Date(now + 48 * 3_600_000),
        initialQuantity: "5.00",
        availableQuantity: "5.00",
        status: BatchStatus.IN_STOCK,
      });
      const spinachBatch = await createBatch(setup.db, {
        seasonId,
        productId: spinachId,
        harvestDate: new Date(now - 86_400_000),
        expirationDate: new Date(now + 48 * 3_600_000),
        initialQuantity: "5.00",
        availableQuantity: "5.00",
        status: BatchStatus.IN_STOCK,
      });

      const customerSessions = await Promise.all(
        Array.from({ length: 10 }, async () => {
          const session = await createAuthenticatedUser(setup.db, jwtService, {
            role: UserRole.CUSTOMER,
          });
          await setup.db.insert(userAddresses).values({
            userId: session.user.id,
            receiverName: "Khách Hàng",
            phoneNumber: "0912345678",
            streetAddress: "123 Lê Lợi",
            placeId: "mock_place_quan_1",
            ward: QUAN_1.name,
            city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
            latitude: QUAN_1.latitude.toFixed(8),
            longitude: QUAN_1.longitude.toFixed(8),
            isDefault: true,
          });
          return session;
        }),
      );

      const responses = await Promise.all(
        customerSessions.map((session, idx) =>
          request(app.getHttpServer())
            .post("/api/v1/orders/checkout")
            .set(session.authHeader)
            .set("Idempotency-Key", randomUUID())
            .send({
              items:
                idx % 2 === 0
                  ? [
                      { productId: tomatoId, quantity: 1 },
                      { productId: spinachId, quantity: 1 },
                    ]
                  : [
                      { productId: spinachId, quantity: 1 },
                      { productId: tomatoId, quantity: 1 },
                    ],
            }),
        ),
      );

      const succeeded = responses.filter((res) => res.status === 201);
      const conflicted = responses.filter((res) => res.status === 409);

      expect(responses.some((res) => res.status >= 500)).toBe(false);
      expect(succeeded).toHaveLength(5);
      expect(conflicted).toHaveLength(5);

      for (const res of conflicted) {
        expect((res.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.INSUFFICIENT_STOCK,
        );
      }

      const [tBatch] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, tomatoBatch.id));
      const [sBatch] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, spinachBatch.id));

      expect(tBatch?.availableQuantity).toBe("0.00");
      expect(tBatch?.status).toBe(BatchStatus.SOLD_OUT);
      expect(sBatch?.availableQuantity).toBe("0.00");
      expect(sBatch?.status).toBe(BatchStatus.SOLD_OUT);
    });

    // Invariant: INV-ORD-11, INV-ORD-14
    it("serializes concurrent confirm and cancel on the same order cleanly without orphaned stock", async () => {
      const now = Date.now();
      const tomatoBatch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        harvestDate: new Date(now - 86_400_000),
        expirationDate: new Date(now + 48 * 3_600_000),
        initialQuantity: "4.00",
        availableQuantity: "4.00",
        status: BatchStatus.IN_STOCK,
      });

      const { order } = await seedOrder({
        items: [{ productId: tomatoId, quantity: "2.00", unitPrice: 80_000 }],
        allocations: [{ batchId: tomatoBatch.id, quantity: "2.00" }],
      });

      const [confirmRes, cancelRes] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/orders/${order.id}/confirm`)
          .set(salesHeader),
        request(app.getHttpServer())
          .patch(`/api/v1/orders/${order.id}/status`)
          .set(salesHeader)
          .send({ status: OrderStatus.CANCELLED }),
      ]);

      expect(confirmRes.status).not.toBe(500);
      expect(cancelRes.status).toBe(200);
      expect([200, 409]).toContain(confirmRes.status);

      const [finalOrder] = await setup.db
        .select()
        .from(orders)
        .where(eq(orders.id, order.id));
      const [finalBatch] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, tomatoBatch.id));
      const activeAllocs = await setup.db
        .select()
        .from(batchAllocations)
        .where(isNull(batchAllocations.releasedAt));

      expect(finalOrder?.orderStatus).toBe(OrderStatus.CANCELLED);
      expect(finalBatch?.availableQuantity).toBe("4.00");
      expect(activeAllocs).toHaveLength(0);
    });

    // Invariant: INV-ORD-12
    it("rejects confirmation when order id is unknown, invalid UUIDv7, or in a non-confirmable status", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/orders/not-a-uuid/confirm")
        .set(salesHeader)
        .expect(400);

      const missingRes = await request(app.getHttpServer())
        .post("/api/v1/orders/019fa8bc-8f4d-7000-b366-e691f45cfb99/confirm")
        .set(salesHeader)
        .expect(404);
      expect((missingRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.ORDER_NOT_FOUND,
      );

      for (const status of [
        OrderStatus.PENDING_PAYMENT,
        OrderStatus.PACKING,
        OrderStatus.CANCELLED,
      ]) {
        const { order } = await seedOrder({
          orderStatus: status,
          items: [{ productId: tomatoId, quantity: "1.00", unitPrice: 80_000 }],
        });

        const res = await request(app.getHttpServer())
          .post(`/api/v1/orders/${order.id}/confirm`)
          .set(salesHeader)
          .expect(409);
        expect((res.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.ORDER_INVALID_STATUS_TRANSITION,
        );
      }
    });

    // Invariant: INV-ORD-11, INV-ORD-18
    it("serializes concurrent checkout and waste write-off approval against the same batch", async () => {
      const now = Date.now();
      const batch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        harvestDate: new Date(now - 86_400_000),
        expirationDate: new Date(now + 48 * 3_600_000),
        initialQuantity: "4.00",
        availableQuantity: "4.00",
        status: BatchStatus.IN_STOCK,
      });

      const [wasteLog] = await setup.db
        .insert(wasteLogs)
        .values({
          batchId: batch.id,
          reportedBy: farmStaffId,
          discardedQuantity: "3.00",
          reason: "Dập nát do vận chuyển nội bộ",
          mediaUrls: [
            "https://res.cloudinary.com/greenroots-farm/image/upload/v1/waste_logs/proof.webp",
          ],
          status: WasteLogStatus.PENDING_APPROVAL,
        })
        .returning();

      const [checkoutRes, approveRes] = await Promise.all([
        request(app.getHttpServer())
          .post("/api/v1/orders/checkout")
          .set(customerHeader)
          .set("Idempotency-Key", randomUUID())
          .send({
            items: [{ productId: tomatoId, quantity: 3 }],
          }),
        request(app.getHttpServer())
          .post(`/api/v1/waste-logs/${wasteLog!.id}/approve`)
          .set(adminHeader)
          .set("Idempotency-Key", randomUUID())
          .send({}),
      ]);

      expect(checkoutRes.status).not.toBe(500);
      expect(approveRes.status).not.toBe(500);
      expect(
        (checkoutRes.status === 201 && approveRes.status === 409) ||
          (checkoutRes.status === 409 && approveRes.status === 200),
      ).toBe(true);

      const [batchRow] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, batch.id));
      expect(batchRow?.availableQuantity).toBe("1.00");
    });
  });

  describe("PATCH /api/v1/orders/:id/status", () => {
    // Invariant: INV-ORD-13
    it("advances confirmed orders linearly through packing, shipping, delivered, and terminal completed", async () => {
      const now = Date.now();
      const batch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        harvestDate: new Date(now - 86_400_000),
        expirationDate: new Date(now + 72 * 3_600_000),
        initialQuantity: "5.00",
        availableQuantity: "5.00",
        status: BatchStatus.IN_STOCK,
      });

      const { order } = await seedOrder({
        paymentStatus: PaymentStatus.PAID,
        items: [{ productId: tomatoId, quantity: "2.00", unitPrice: 80_000 }],
        allocations: [{ batchId: batch.id, quantity: "2.00" }],
      });

      // Cannot bypass POST /confirm via PATCH /status
      const bypassRes = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${order.id}/status`)
        .set(salesHeader)
        .send({ status: OrderStatus.CONFIRMED })
        .expect(422);
      expect((bypassRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.ORDER_INVALID_STATUS_TRANSITION,
      );

      await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/confirm`)
        .set(salesHeader)
        .expect(200);

      for (const nextStatus of [
        OrderStatus.PACKING,
        OrderStatus.SHIPPING,
        OrderStatus.DELIVERED,
        OrderStatus.COMPLETED,
      ]) {
        const res = await request(app.getHttpServer())
          .patch(`/api/v1/orders/${order.id}/status`)
          .set(salesHeader)
          .send({ status: nextStatus })
          .expect(200);

        expect(
          (res.body as ApiResponse<StaffOrderResponse>).data.orderStatus,
        ).toBe(nextStatus);
      }

      const terminalRes = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${order.id}/status`)
        .set(salesHeader)
        .send({ status: OrderStatus.CANCELLED })
        .expect(422);
      expect((terminalRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.ORDER_INVALID_STATUS_TRANSITION,
      );
    });

    // Invariant: INV-PAID-COMPLETE
    it("rejects delivered to completed transition when order paymentStatus is pending", async () => {
      const now = Date.now();
      const batch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        harvestDate: new Date(now - 86_400_000),
        expirationDate: new Date(now + 72 * 3_600_000),
        initialQuantity: "5.00",
        availableQuantity: "5.00",
        status: BatchStatus.IN_STOCK,
      });

      const { order } = await seedOrder({
        orderStatus: OrderStatus.DELIVERED,
        paymentStatus: PaymentStatus.PENDING,
        items: [{ productId: tomatoId, quantity: "2.00", unitPrice: 80_000 }],
        allocations: [{ batchId: batch.id, quantity: "2.00" }],
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${order.id}/status`)
        .set(salesHeader)
        .send({ status: OrderStatus.COMPLETED })
        .expect(422);

      expect((res.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.ORDER_PAYMENT_REQUIRED,
      );
    });

    // Invariant: INV-ORD-14, INV-ORD-15
    it("soft-releases allocations, restores batch stock and status, cancels COD payment, and refunds loyalty points on cancellation", async () => {
      const now = Date.now();
      const depletedBatch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        harvestDate: new Date(now - 86_400_000),
        expirationDate: new Date(now + 72 * 3_600_000),
        initialQuantity: "2.00",
        availableQuantity: "2.00",
        status: BatchStatus.IN_STOCK,
      });

      const { order } = await seedOrder({
        loyaltyPointsUsed: 25_000,
        items: [{ productId: tomatoId, quantity: "2.00", unitPrice: 80_000 }],
        allocations: [
          { batchId: depletedBatch.id, quantity: "2.00", markSoldOut: true },
        ],
      });

      await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/confirm`)
        .set(salesHeader)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${order.id}/status`)
        .set(adminHeader)
        .send({ status: OrderStatus.PACKING })
        .expect(200);

      const cancelRes = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${order.id}/status`)
        .set(superAdminHeader)
        .send({ status: OrderStatus.CANCELLED })
        .expect(200);

      const cancelledBody = (cancelRes.body as ApiResponse<StaffOrderResponse>)
        .data;
      expect(cancelledBody.orderStatus).toBe(OrderStatus.CANCELLED);
      expect(cancelledBody.paymentStatus).toBe(PaymentStatus.CANCELLED);
      expect(cancelledBody.items[0]?.allocations).toHaveLength(1);
      expect(cancelledBody.items[0]?.allocations[0]?.releasedAt).not.toBeNull();

      const [restoredBatch] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, depletedBatch.id));
      const [paymentRow] = await setup.db
        .select()
        .from(payments)
        .where(eq(payments.orderId, order.id));
      const [customerRow] = await setup.db
        .select()
        .from(users)
        .where(eq(users.id, customerId));
      const activeAllocs = await setup.db
        .select()
        .from(batchAllocations)
        .where(isNull(batchAllocations.releasedAt));

      expect(restoredBatch?.availableQuantity).toBe("2.00");
      expect(restoredBatch?.status).toBe(BatchStatus.IN_STOCK);
      expect(paymentRow?.status).toBe(PaymentStatus.CANCELLED);
      expect(customerRow?.rewardPoints).toBe(125_000);
      expect(activeAllocs).toHaveLength(0);
    });

    // Invariant: INV-ORD-14
    it("marks a restored depleted batch as expired when expirationDate elapsed before cancellation", async () => {
      const now = Date.now();
      const shortBatch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        harvestDate: new Date(now - 86_400_000),
        expirationDate: new Date(now + 2_000),
        initialQuantity: "2.00",
        availableQuantity: "2.00",
        status: BatchStatus.NEAR_EXPIRY,
      });

      const { order } = await seedOrder({
        items: [{ productId: tomatoId, quantity: "2.00", unitPrice: 80_000 }],
        allocations: [
          { batchId: shortBatch.id, quantity: "2.00", markSoldOut: true },
        ],
      });

      await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/confirm`)
        .set(salesHeader)
        .expect(200);

      // Push expirationDate into the past to simulate time passing while waiting for packing
      await setup.db
        .update(batches)
        .set({ expirationDate: new Date(Date.now() - 5_000) })
        .where(eq(batches.id, shortBatch.id));

      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${order.id}/status`)
        .set(salesHeader)
        .send({ status: OrderStatus.CANCELLED })
        .expect(200);

      const [restoredBatch] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, shortBatch.id));

      expect(restoredBatch?.availableQuantity).toBe("2.00");
      expect(restoredBatch?.status).toBe(BatchStatus.EXPIRED);
    });

    // Invariant: INV-ORD-14
    it("restores a depleted batch to near_expiry when expirationDate remains within the HSD threshold", async () => {
      const now = Date.now();
      const nearBatch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        harvestDate: new Date(now - 86_400_000),
        expirationDate: new Date(now + 12 * 3_600_000),
        initialQuantity: "2.00",
        availableQuantity: "2.00",
        status: BatchStatus.NEAR_EXPIRY,
      });

      const { order } = await seedOrder({
        items: [{ productId: tomatoId, quantity: "2.00", unitPrice: 80_000 }],
        allocations: [
          { batchId: nearBatch.id, quantity: "2.00", markSoldOut: true },
        ],
      });

      await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/confirm`)
        .set(salesHeader)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${order.id}/status`)
        .set(salesHeader)
        .send({ status: OrderStatus.CANCELLED })
        .expect(200);

      const [restoredBatch] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, nearBatch.id));

      expect(restoredBatch?.availableQuantity).toBe("2.00");
      expect(restoredBatch?.status).toBe(BatchStatus.NEAR_EXPIRY);
    });

    // Invariant: INV-ORD-15
    it("cancels unpaid pending_payment PayOS and pending_confirmation COD orders while refunding loyalty points", async () => {
      const { order: pendingPaymentOrder } = await seedOrder({
        orderStatus: OrderStatus.PENDING_PAYMENT,
        paymentMethod: PaymentMethod.PAYOS,
        paymentStatus: PaymentStatus.PENDING,
        loyaltyPointsUsed: 10_000,
        items: [{ productId: tomatoId, quantity: "2.00", unitPrice: 80_000 }],
      });
      const { order: pendingConfirmationOrder } = await seedOrder({
        orderStatus: OrderStatus.PENDING_CONFIRMATION,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PENDING,
        loyaltyPointsUsed: 15_000,
        items: [{ productId: tomatoId, quantity: "2.00", unitPrice: 80_000 }],
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${pendingPaymentOrder.id}/status`)
        .set(salesHeader)
        .send({ status: OrderStatus.CANCELLED })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${pendingConfirmationOrder.id}/status`)
        .set(salesHeader)
        .send({ status: OrderStatus.CANCELLED })
        .expect(200);

      const [customerRow] = await setup.db
        .select()
        .from(users)
        .where(eq(users.id, customerId));
      const [payosPayment] = await setup.db
        .select()
        .from(payments)
        .where(eq(payments.orderId, pendingPaymentOrder.id));

      expect(customerRow?.rewardPoints).toBe(125_000);
      expect(payosPayment?.status).toBe(PaymentStatus.CANCELLED);
    });

    // Invariant: INV-ORD-15
    it("blocks cancelling PAID PayOS and subscription orders via the status endpoint", async () => {
      const { order: paidPayosOrder } = await seedOrder({
        orderStatus: OrderStatus.CONFIRMED,
        paymentMethod: PaymentMethod.PAYOS,
        paymentStatus: PaymentStatus.PAID,
        items: [{ productId: tomatoId, quantity: "2.00", unitPrice: 80_000 }],
      });
      const { order: subscriptionOrder } = await seedOrder({
        orderStatus: OrderStatus.CONFIRMED,
        paymentMethod: PaymentMethod.SUBSCRIPTION,
        paymentStatus: PaymentStatus.PENDING,
        items: [{ productId: tomatoId, quantity: "2.00", unitPrice: 80_000 }],
      });

      for (const blockedOrder of [paidPayosOrder, subscriptionOrder]) {
        const res = await request(app.getHttpServer())
          .patch(`/api/v1/orders/${blockedOrder.id}/status`)
          .set(salesHeader)
          .send({ status: OrderStatus.CANCELLED })
          .expect(422);

        expect((res.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.ORDER_PAID_CANCELLATION_FORBIDDEN,
        );
      }

      const missingRes = await request(app.getHttpServer())
        .patch("/api/v1/orders/019fa8bc-8f4d-7000-b366-e691f45cfb99/status")
        .set(salesHeader)
        .send({ status: OrderStatus.CANCELLED })
        .expect(404);
      expect((missingRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.ORDER_NOT_FOUND,
      );

      await request(app.getHttpServer())
        .patch("/api/v1/orders/not-a-uuid/status")
        .set(salesHeader)
        .send({ status: OrderStatus.CANCELLED })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${paidPayosOrder.id}/status`)
        .set(salesHeader)
        .send({ status: "processing", unexpected: true })
        .expect(400);
    });
  });

  describe("RBAC Matrix", () => {
    // Invariant: INV-ORD-16
    it("rejects customer, farm_staff, guest, and unauthenticated callers on confirm and status routes", async () => {
      const { order } = await seedOrder({
        items: [{ productId: tomatoId, quantity: "2.00", unitPrice: 80_000 }],
      });

      await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/confirm`)
        .expect(401);

      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${order.id}/status`)
        .send({ status: OrderStatus.CANCELLED })
        .expect(401);

      for (const forbiddenHeader of [
        customerHeader,
        farmStaffHeader,
        guestHeader,
      ]) {
        await request(app.getHttpServer())
          .post(`/api/v1/orders/${order.id}/confirm`)
          .set(forbiddenHeader)
          .expect(403);

        await request(app.getHttpServer())
          .patch(`/api/v1/orders/${order.id}/status`)
          .set(forbiddenHeader)
          .send({ status: OrderStatus.CANCELLED })
          .expect(403);
      }

      // Sanity check that staff roles can still be rejected on customer routes
      await request(app.getHttpServer())
        .get("/api/v1/orders/me")
        .set(salesHeader)
        .expect(403);
    });
  });
});
