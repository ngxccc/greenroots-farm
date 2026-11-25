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
import { eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
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

type OrderResponse = components["schemas"]["OrderDto"];
type StaffOrderResponse = components["schemas"]["StaffOrderDto"];

const QUAN_1 = HCMC_DISTRICTS.find((d) => d.code === "quan-1")!;

describe("Orders Concurrency Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let jwtService: JwtService;
  let appRedisClient: ReturnType<RedisService["getClient"]>;

  let customerId: string;
  let salesHeader: { Authorization: string };

  let seasonId: string;
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
      sql`TRUNCATE TABLE "payments", "batch_allocations", "order_items", "orders", "batches", "products", "categories", "seasons", "plots", "farms", "user_addresses", "users" CASCADE;`,
    );
    await cleanScopedRedisKeys(setup.redisClient);
    await appRedisClient
      .unlink(FARM_SETTINGS_CACHE_KEY, FARM_SETTINGS_INVALIDATED_AT_KEY)
      .catch(() => undefined);

    const [customerSession, salesSession] = await Promise.all([
      createAuthenticatedUser(setup.db, jwtService, {
        role: UserRole.CUSTOMER,
        rewardPoints: 0,
      }),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.SALES),
    ]);

    customerId = customerSession.user.id;
    salesHeader = salesSession.authHeader;

    const farm = await createFarm(setup.db);
    const plot = await createPlot(setup.db, { farmId: farm.id });
    const season = await createSeason(setup.db, { plotId: plot.id });
    seasonId = season.id;

    const category = await createCategory(setup.db);
    const [tomato, spinach] = await Promise.all([
      createProduct(setup.db, {
        categoryId: category.id,
        name: "Cà chua bi hữu cơ",
        slug: "ca-chua-bi-concurrency",
        basePrice: 80_000,
        salePrice: null,
        unit: "kg",
      }),
      createProduct(setup.db, {
        categoryId: category.id,
        name: "Cải bó xôi hữu cơ",
        slug: "cai-bo-xoi-concurrency",
        basePrice: 50_000,
        salePrice: null,
        unit: "kg",
      }),
    ]);

    tomatoId = tomato.id;
    spinachId = spinach.id;
  });

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  async function seedPendingOrder(
    items: { productId: string; quantity: string; unitPrice: number }[],
  ) {
    orderCounter += 1;
    const subtotal = items.reduce(
      (sum, item) =>
        sum +
        Math.round(
          (Math.round(Number(item.quantity) * 100) * item.unitPrice) / 100,
        ),
      0,
    );
    const shippingFee = 15_000;
    const totalAmount = subtotal + shippingFee;

    const [createdOrder] = await setup.db
      .insert(orders)
      .values({
        orderCode: `ORD-20261125-C${String(orderCounter).padStart(5, "0")}`,
        customerId,
        receiverName: "Trần Thị Khách",
        receiverPhone: "0912345678",
        shippingAddress: "12 Nguyễn Văn Linh, Quận 7, TP. Hồ Chí Minh",
        shippingDistanceKm: "5.00",
        shippingFee,
        subtotal,
        discountAmount: 0,
        loyaltyPointsUsed: 0,
        totalAmount,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PENDING,
        orderStatus: OrderStatus.PENDING_CONFIRMATION,
      })
      .returning();

    await setup.db.insert(orderItems).values(
      items.map((item) => ({
        orderId: createdOrder!.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    );

    await setup.db.insert(payments).values({
      orderId: createdOrder!.id,
      amount: totalAmount,
      paymentMethod: PaymentMethod.COD,
      status: PaymentStatus.PENDING,
      transactionType: PaymentTransactionType.PAYMENT,
    });

    return createdOrder!;
  }

  describe("POST /api/v1/orders/:id/confirm", () => {
    // Invariant: INV-ORD-11
    it("allocates limited multi-batch stock in strict FEFO order across ten parallel confirmations", async () => {
      const now = Date.now();
      const [earlyBatch, middleBatch, lateBatch] = await Promise.all([
        createBatch(setup.db, {
          seasonId,
          productId: tomatoId,
          harvestDate: new Date(now - 86_400_000),
          expirationDate: new Date(now + 24 * 3_600_000),
          initialQuantity: "2.50",
          availableQuantity: "2.50",
          status: BatchStatus.NEAR_EXPIRY,
        }),
        createBatch(setup.db, {
          seasonId,
          productId: tomatoId,
          harvestDate: new Date(now - 86_400_000),
          expirationDate: new Date(now + 48 * 3_600_000),
          initialQuantity: "3.50",
          availableQuantity: "3.50",
          status: BatchStatus.IN_STOCK,
        }),
        createBatch(setup.db, {
          seasonId,
          productId: tomatoId,
          harvestDate: new Date(now - 86_400_000),
          expirationDate: new Date(now + 96 * 3_600_000),
          initialQuantity: "4.00",
          availableQuantity: "4.00",
          status: BatchStatus.IN_STOCK,
        }),
      ]);

      const seededOrders = await Promise.all(
        Array.from({ length: 10 }, () =>
          seedPendingOrder([
            { productId: tomatoId, quantity: "1.50", unitPrice: 80_000 },
          ]),
        ),
      );

      const responses = await Promise.all(
        seededOrders.map((order) =>
          request(app.getHttpServer())
            .post(`/api/v1/orders/${order.id}/confirm`)
            .set(salesHeader),
        ),
      );

      expect(responses.some((res) => res.status >= 500)).toBe(false);

      const succeeded = responses.filter((res) => res.status === 200);
      const conflicted = responses.filter((res) => res.status === 409);
      expect(succeeded).toHaveLength(6);
      expect(conflicted).toHaveLength(4);

      for (const res of conflicted) {
        expect((res.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.INSUFFICIENT_STOCK,
        );
      }

      const batchRows = await setup.db
        .select()
        .from(batches)
        .where(
          inArray(batches.id, [earlyBatch.id, middleBatch.id, lateBatch.id]),
        );
      const byId = new Map(batchRows.map((row) => [row.id, row]));

      expect(byId.get(earlyBatch.id)?.availableQuantity).toBe("0.00");
      expect(byId.get(earlyBatch.id)?.status).toBe(BatchStatus.SOLD_OUT);
      expect(byId.get(middleBatch.id)?.availableQuantity).toBe("0.00");
      expect(byId.get(middleBatch.id)?.status).toBe(BatchStatus.SOLD_OUT);
      expect(byId.get(lateBatch.id)?.availableQuantity).toBe("1.00");
      expect(byId.get(lateBatch.id)?.status).toBe(BatchStatus.IN_STOCK);

      for (const row of batchRows) {
        expect(Number(row.availableQuantity)).toBeGreaterThanOrEqual(0);
      }

      const activeAllocs = await setup.db
        .select()
        .from(batchAllocations)
        .where(isNull(batchAllocations.releasedAt));
      const totalAllocatedCents = activeAllocs.reduce(
        (sum, alloc) => sum + Math.round(Number(alloc.allocatedQuantity) * 100),
        0,
      );
      const fulfilledOrderIds = succeeded.map(
        (res) => (res.body as ApiResponse<StaffOrderResponse>).data.id,
      );
      const fulfilledItems = await setup.db
        .select()
        .from(orderItems)
        .where(inArray(orderItems.orderId, fulfilledOrderIds));
      const totalFulfilledCents = fulfilledItems.reduce(
        (sum, item) => sum + Math.round(Number(item.quantity) * 100),
        0,
      );

      expect(totalAllocatedCents).toBe(900);
      expect(totalAllocatedCents).toBe(totalFulfilledCents);
    });
  });

  describe("POST /api/v1/orders/checkout", () => {
    // Invariant: INV-ORD-11, INV-ORD-4
    it("serializes ten parallel distinct-user checkouts followed by parallel confirmations without overselling stock", async () => {
      const now = Date.now();
      const tomatoBatch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        harvestDate: new Date(now - 86_400_000),
        expirationDate: new Date(now + 48 * 3_600_000),
        initialQuantity: "6.00",
        availableQuantity: "6.00",
        status: BatchStatus.IN_STOCK,
      });

      const customers = await Promise.all(
        Array.from({ length: 10 }, () =>
          createAuthenticatedUser(setup.db, jwtService, {
            role: UserRole.CUSTOMER,
            rewardPoints: 0,
          }),
        ),
      );

      await setup.db.insert(userAddresses).values(
        customers.map((session, idx) => ({
          userId: session.user.id,
          receiverName: `Khách Hàng ${idx + 1}`,
          phoneNumber: `09123456${String(idx).padStart(2, "0")}`,
          streetAddress: `${idx + 1} Lê Lợi`,
          districtCode: QUAN_1.code,
          district: QUAN_1.name,
          city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
          latitude: QUAN_1.latitude.toFixed(8),
          longitude: QUAN_1.longitude.toFixed(8),
          isDefault: true,
        })),
      );

      // COD checkout does not lock batches (ADR-0031); FEFO reservation occurs at confirmation (ADR-0033).
      const checkoutResponses = await Promise.all(
        customers.map((session) =>
          request(app.getHttpServer())
            .post("/api/v1/orders/checkout")
            .set(session.authHeader)
            .set("Idempotency-Key", randomUUID())
            .send({
              items: [{ productId: tomatoId, quantity: 2 }],
            }),
        ),
      );

      expect(checkoutResponses.some((res) => res.status >= 500)).toBe(false);
      for (const res of checkoutResponses) {
        expect(res.status).toBe(201);
      }

      const [batchAfterCheckout] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, tomatoBatch.id));
      expect(batchAfterCheckout?.availableQuantity).toBe("6.00");

      const createdOrderIds = checkoutResponses.map(
        (res) => (res.body as ApiResponse<OrderResponse>).data.id,
      );
      const confirmResponses = await Promise.all(
        createdOrderIds.map((orderId) =>
          request(app.getHttpServer())
            .post(`/api/v1/orders/${orderId}/confirm`)
            .set(salesHeader),
        ),
      );

      expect(confirmResponses.some((res) => res.status >= 500)).toBe(false);
      const confirmed = confirmResponses.filter((res) => res.status === 200);
      const rejected = confirmResponses.filter((res) => res.status === 409);

      expect(confirmed).toHaveLength(3);
      expect(rejected).toHaveLength(7);
      for (const res of rejected) {
        expect((res.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.INSUFFICIENT_STOCK,
        );
      }

      const [batchAfterConfirm] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, tomatoBatch.id));
      expect(batchAfterConfirm?.availableQuantity).toBe("0.00");
      expect(batchAfterConfirm?.status).toBe(BatchStatus.SOLD_OUT);

      const activeAllocs = await setup.db
        .select()
        .from(batchAllocations)
        .where(isNull(batchAllocations.releasedAt));
      const totalAllocatedCents = activeAllocs.reduce(
        (sum, alloc) => sum + Math.round(Number(alloc.allocatedQuantity) * 100),
        0,
      );
      expect(totalAllocatedCents).toBe(600);
    });
  });

  describe("PATCH /api/v1/orders/:id/status", () => {
    // Invariant: INV-ORD-11, INV-ORD-14
    it("serializes concurrent cancellations across confirmed orders sharing batches without deadlocks or stock drift", async () => {
      const now = Date.now();
      const [tomatoBatch, spinachBatch] = await Promise.all([
        createBatch(setup.db, {
          seasonId,
          productId: tomatoId,
          harvestDate: new Date(now - 86_400_000),
          expirationDate: new Date(now + 72 * 3_600_000),
          initialQuantity: "10.00",
          availableQuantity: "10.00",
          status: BatchStatus.IN_STOCK,
        }),
        createBatch(setup.db, {
          seasonId,
          productId: spinachId,
          harvestDate: new Date(now - 86_400_000),
          expirationDate: new Date(now + 72 * 3_600_000),
          initialQuantity: "10.00",
          availableQuantity: "10.00",
          status: BatchStatus.IN_STOCK,
        }),
      ]);

      const seededOrders = await Promise.all(
        Array.from({ length: 6 }, (_, idx) =>
          seedPendingOrder(
            idx % 2 === 0
              ? [
                  { productId: tomatoId, quantity: "1.00", unitPrice: 80_000 },
                  { productId: spinachId, quantity: "1.00", unitPrice: 50_000 },
                ]
              : [
                  { productId: spinachId, quantity: "1.00", unitPrice: 50_000 },
                  { productId: tomatoId, quantity: "1.00", unitPrice: 80_000 },
                ],
          ),
        ),
      );

      for (const order of seededOrders) {
        await request(app.getHttpServer())
          .post(`/api/v1/orders/${order.id}/confirm`)
          .set(salesHeader)
          .expect(200);
      }

      const cancelResponses = await Promise.all(
        seededOrders.map((order) =>
          request(app.getHttpServer())
            .patch(`/api/v1/orders/${order.id}/status`)
            .set(salesHeader)
            .send({ status: OrderStatus.CANCELLED }),
        ),
      );

      expect(cancelResponses.some((res) => res.status >= 500)).toBe(false);
      for (const res of cancelResponses) {
        expect(res.status).toBe(200);
        const body = res.body as ApiResponse<StaffOrderResponse>;
        expect(body.data.orderStatus).toBe(OrderStatus.CANCELLED);
      }

      const [finalTomato] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, tomatoBatch.id));
      const [finalSpinach] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, spinachBatch.id));

      expect(finalTomato?.availableQuantity).toBe("10.00");
      expect(finalTomato?.status).toBe(BatchStatus.IN_STOCK);
      expect(finalSpinach?.availableQuantity).toBe("10.00");
      expect(finalSpinach?.status).toBe(BatchStatus.IN_STOCK);

      const activeAllocs = await setup.db
        .select()
        .from(batchAllocations)
        .where(isNull(batchAllocations.releasedAt));
      const releasedAllocs = await setup.db
        .select()
        .from(batchAllocations)
        .where(isNotNull(batchAllocations.releasedAt));

      expect(activeAllocs).toHaveLength(0);
      expect(releasedAllocs).toHaveLength(12);
    });
  });
});
