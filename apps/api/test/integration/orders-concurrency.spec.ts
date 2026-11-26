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
  UserRole,
} from "@greenroots/shared";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";
import { RedisService } from "@/common/services/redis.service";
import type { ApiResponse } from "@/common/utils/api-response.util";
import {
  batchAllocations,
  batches,
  userAddresses,
  users,
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

const QUAN_1 = HCMC_DISTRICTS.find((d) => d.code === "quan-1")!;

describe("Orders Concurrency Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let jwtService: JwtService;
  let appRedisClient: ReturnType<RedisService["getClient"]>;

  let salesHeader: { Authorization: string };
  let seasonId: string;
  let tomatoId: string;

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    jwtService = app.get(JwtService);
    appRedisClient = app.get(RedisService).getClient();
  }, 30000);

  beforeEach(async () => {
    await setup.db.execute(
      sql`TRUNCATE TABLE "payments", "batch_allocations", "order_items", "orders", "batches", "products", "categories", "seasons", "plots", "farms", "user_addresses", "users" CASCADE;`,
    );
    await cleanScopedRedisKeys(setup.redisClient);
    await appRedisClient
      .unlink(FARM_SETTINGS_CACHE_KEY, FARM_SETTINGS_INVALIDATED_AT_KEY)
      .catch(() => undefined);

    const salesSession = await createAuthenticatedAdmin(
      setup.db,
      jwtService,
      UserRole.SALES,
    );
    salesHeader = salesSession.authHeader;

    const farm = await createFarm(setup.db);
    const plot = await createPlot(setup.db, { farmId: farm.id });
    const season = await createSeason(setup.db, { plotId: plot.id });
    seasonId = season.id;

    const category = await createCategory(setup.db);
    const tomato = await createProduct(setup.db, {
      categoryId: category.id,
      name: "Cà chua bi hữu cơ",
      slug: "ca-chua-bi-concurrency",
      basePrice: 80_000,
      salePrice: null,
      unit: "kg",
    });
    tomatoId = tomato.id;
  });

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  async function createCustomerWithAddress(rewardPoints = 0) {
    const session = await createAuthenticatedUser(setup.db, jwtService, {
      role: UserRole.CUSTOMER,
      rewardPoints,
    });
    await setup.db.insert(userAddresses).values({
      userId: session.user.id,
      receiverName: "Khách Hàng",
      phoneNumber: "0912345678",
      streetAddress: "123 Lê Lợi",
      placeId: "mock_place_quan_1",
      district: QUAN_1.name,
      city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
      latitude: QUAN_1.latitude.toFixed(8),
      longitude: QUAN_1.longitude.toFixed(8),
      isDefault: true,
    });
    return session;
  }

  describe("Concurrent Lock Ordering", () => {
    // Invariant: INV-ORD-18, INV-ORD-19
    it("serializes ten parallel distinct-user checkouts across multiple batches in strict FEFO order", async () => {
      const now = Date.now();
      const nearBatch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        batchCode: "BATCH-CONC-NEAR",
        harvestDate: new Date(now - 2 * 86_400_000),
        expirationDate: new Date(now + 12 * 3_600_000),
        initialQuantity: "3.00",
        availableQuantity: "3.00",
        status: BatchStatus.NEAR_EXPIRY,
      });
      const freshBatch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        batchCode: "BATCH-CONC-FRESH",
        harvestDate: new Date(now - 86_400_000),
        expirationDate: new Date(now + 72 * 3_600_000),
        initialQuantity: "7.00",
        availableQuantity: "7.00",
        status: BatchStatus.IN_STOCK,
      });

      const customers = await Promise.all(
        Array.from({ length: 10 }, () => createCustomerWithAddress()),
      );

      const responses = await Promise.all(
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

      expect(responses.some((r) => r.status >= 500)).toBe(false);
      const created = responses.filter((r) => r.status === 201);
      const conflicted = responses.filter((r) => r.status === 409);

      expect(created).toHaveLength(5);
      expect(conflicted).toHaveLength(5);
      for (const res of conflicted) {
        expect((res.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.INSUFFICIENT_STOCK,
        );
      }

      const [nearRow] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, nearBatch.id));
      const [freshRow] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, freshBatch.id));

      expect(nearRow?.availableQuantity).toBe("0.00");
      expect(nearRow?.status).toBe(BatchStatus.SOLD_OUT);
      expect(freshRow?.availableQuantity).toBe("0.00");
      expect(freshRow?.status).toBe(BatchStatus.SOLD_OUT);

      const activeAllocs = await setup.db
        .select()
        .from(batchAllocations)
        .where(isNull(batchAllocations.releasedAt));

      const totalAllocated = activeAllocs.reduce(
        (sum, alloc) => sum + Number(alloc.allocatedQuantity),
        0,
      );
      const nearAllocated = activeAllocs
        .filter((a) => a.batchId === nearBatch.id)
        .reduce((sum, a) => sum + Number(a.allocatedQuantity), 0);
      const freshAllocated = activeAllocs
        .filter((a) => a.batchId === freshBatch.id)
        .reduce((sum, a) => sum + Number(a.allocatedQuantity), 0);

      expect(totalAllocated).toBe(10);
      expect(nearAllocated).toBe(3);
      expect(freshAllocated).toBe(7);
    });

    // Invariant: INV-ORD-19
    it("serializes concurrent loyalty checkouts and customer or staff cancellations on shared batches without deadlocks", async () => {
      const now = Date.now();
      const sharedBatch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        batchCode: "BATCH-CONC-SHARED",
        harvestDate: new Date(now - 86_400_000),
        expirationDate: new Date(now + 48 * 3_600_000),
        initialQuantity: "10.00",
        availableQuantity: "10.00",
        status: BatchStatus.IN_STOCK,
      });

      const initialCustomers = await Promise.all(
        Array.from({ length: 4 }, () => createCustomerWithAddress(20_000)),
      );
      const newCustomers = await Promise.all(
        Array.from({ length: 4 }, () => createCustomerWithAddress(20_000)),
      );

      // Seed 4 pending orders holding 8.00 kg total (2.00 kg remains)
      const initialOrders = await Promise.all(
        initialCustomers.map(async (session) => {
          const res = await request(app.getHttpServer())
            .post("/api/v1/orders/checkout")
            .set(session.authHeader)
            .set("Idempotency-Key", randomUUID())
            .send({
              items: [{ productId: tomatoId, quantity: 2 }],
              loyaltyPoints: 10_000,
            })
            .expect(201);
          return {
            session,
            orderId: (res.body as ApiResponse<OrderResponse>).data.id,
          };
        }),
      );

      // Race 2 customer self-cancels + 2 staff cancels + 4 new loyalty checkouts
      const cancelPromises = [
        request(app.getHttpServer())
          .post(`/api/v1/orders/${initialOrders[0]!.orderId}/cancel`)
          .set(initialOrders[0]!.session.authHeader),
        request(app.getHttpServer())
          .post(`/api/v1/orders/${initialOrders[1]!.orderId}/cancel`)
          .set(initialOrders[1]!.session.authHeader),
        request(app.getHttpServer())
          .patch(`/api/v1/orders/${initialOrders[2]!.orderId}/status`)
          .set(salesHeader)
          .send({ status: OrderStatus.CANCELLED }),
        request(app.getHttpServer())
          .patch(`/api/v1/orders/${initialOrders[3]!.orderId}/status`)
          .set(salesHeader)
          .send({ status: OrderStatus.CANCELLED }),
      ];

      const checkoutPromises = newCustomers.map((session) =>
        request(app.getHttpServer())
          .post("/api/v1/orders/checkout")
          .set(session.authHeader)
          .set("Idempotency-Key", randomUUID())
          .send({
            items: [{ productId: tomatoId, quantity: 2 }],
            loyaltyPoints: 10_000,
          }),
      );

      const [cancelResults, checkoutResults] = await Promise.all([
        Promise.all(cancelPromises),
        Promise.all(checkoutPromises),
      ]);

      for (const res of cancelResults) {
        expect(res.status).toBe(200);
      }
      for (const res of checkoutResults) {
        expect(res.status).toBeLessThan(500);
        expect([201, 409]).toContain(res.status);
      }

      // Cancelled customers have their 20,000 points fully restored
      for (const { session } of initialOrders) {
        const [userRow] = await setup.db
          .select({ rewardPoints: users.rewardPoints })
          .from(users)
          .where(eq(users.id, session.user.id));
        expect(userRow?.rewardPoints).toBe(20_000);
      }

      const [batchRow] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, sharedBatch.id));
      const activeAllocs = await setup.db
        .select()
        .from(batchAllocations)
        .where(isNull(batchAllocations.releasedAt));

      const allocatedSum = activeAllocs.reduce(
        (sum, alloc) => sum + Number(alloc.allocatedQuantity),
        0,
      );
      expect(Number(batchRow?.availableQuantity) + allocatedSum).toBe(10);
    });
  });
});
