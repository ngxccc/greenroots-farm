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
import { eq, sql } from "drizzle-orm";
import {
  API_ERROR_CODES,
  BatchStatus,
  OrderStatus,
  UserRole,
} from "@greenroots/shared";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";
import type { ApiResponse } from "@/common/utils/api-response.util";
import { batchAllocations, batches, products } from "@/database/schemas";
import {
  createBatch,
  createCategory,
  createFarm,
  createOrder,
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

type OrderPickListResponse = components["schemas"]["OrderPickListDto"];

describe("Orders Pick List Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let jwtService: JwtService;

  let customerId: string;
  let customerHeader: { Authorization: string };
  let guestHeader: { Authorization: string };
  let farmStaffHeader: { Authorization: string };
  let salesHeader: { Authorization: string };
  let adminHeader: { Authorization: string };
  let superAdminHeader: { Authorization: string };

  let seasonId: string;
  let categoryId: string;
  let tomatoId: string;
  let spinachId: string;

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    jwtService = app.get(JwtService);
  }, 30000);

  beforeEach(async () => {
    await setup.db.execute(
      sql`TRUNCATE TABLE "waste_logs", "payments", "batch_allocations", "order_items", "orders", "batches", "products", "categories", "seasons", "plots", "farms", "user_addresses", "users" CASCADE;`,
    );
    await cleanScopedRedisKeys(setup.redisClient);

    const [
      customerSession,
      guestSession,
      farmStaffSession,
      salesSession,
      adminSession,
      superAdminSession,
    ] = await Promise.all([
      createAuthenticatedUser(setup.db, jwtService, {
        role: UserRole.CUSTOMER,
      }),
      createAuthenticatedUser(setup.db, jwtService, {
        role: UserRole.GUEST,
      }),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.FARM_STAFF),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.SALES),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.ADMIN),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.SUPER_ADMIN),
    ]);

    customerId = customerSession.user.id;
    customerHeader = customerSession.authHeader;
    guestHeader = guestSession.authHeader;
    farmStaffHeader = farmStaffSession.authHeader;
    salesHeader = salesSession.authHeader;
    adminHeader = adminSession.authHeader;
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
      slug: "ca-chua-bi-pick-list",
      basePrice: 80_000,
      salePrice: null,
      unit: "kg",
    });
    tomatoId = tomato.id;

    const spinach = await createProduct(setup.db, {
      categoryId,
      name: "Cải bó xôi hữu cơ",
      slug: "cai-bo-xoi-pick-list",
      basePrice: 50_000,
      salePrice: null,
      unit: "kg",
    });
    spinachId = spinach.id;
  });

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  describe("GET /api/v1/orders/:id/pick-list", () => {
    // Invariant: INV-ORD-17, INV-ORD-18, INV-ORD-20
    it("returns active allocations grouped by batch in FEFO order across confirmed, packing, and shipping without mutating stock or exposing PII", async () => {
      const now = Date.now();
      const batchTomato1 = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        batchCode: "BATCH-PICK-TOM-1",
        harvestDate: new Date(now - 2 * 86_400_000),
        expirationDate: new Date(now + 24 * 3_600_000),
        initialQuantity: "10.00",
        availableQuantity: "10.00",
        status: BatchStatus.NEAR_EXPIRY,
      });
      const batchSpinach = await createBatch(setup.db, {
        seasonId,
        productId: spinachId,
        batchCode: "BATCH-PICK-SPN-1",
        harvestDate: new Date(now - 1 * 86_400_000),
        expirationDate: new Date(now + 48 * 3_600_000),
        initialQuantity: "10.00",
        availableQuantity: "10.00",
        status: BatchStatus.IN_STOCK,
      });
      const batchTomato2 = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        batchCode: "BATCH-PICK-TOM-2",
        harvestDate: new Date(now - 1 * 86_400_000),
        expirationDate: new Date(now + 72 * 3_600_000),
        initialQuantity: "10.00",
        availableQuantity: "10.00",
        status: BatchStatus.IN_STOCK,
      });

      const { order, items } = await createOrder(setup.db, {
        customerId,
        items: [
          { productId: tomatoId, quantity: "12.00", unitPrice: 80_000 },
          { productId: spinachId, quantity: "3.50", unitPrice: 50_000 },
        ],
      });

      await setup.db.insert(batchAllocations).values([
        {
          orderItemId: items[0]!.id,
          batchId: batchTomato1.id,
          allocatedQuantity: "10.00",
        },
        {
          orderItemId: items[0]!.id,
          batchId: batchTomato2.id,
          allocatedQuantity: "2.00",
        },
        {
          orderItemId: items[1]!.id,
          batchId: batchSpinach.id,
          allocatedQuantity: "3.50",
        },
      ]);

      await Promise.all([
        setup.db
          .update(batches)
          .set({ availableQuantity: "0.00", status: BatchStatus.SOLD_OUT })
          .where(eq(batches.id, batchTomato1.id)),
        setup.db
          .update(batches)
          .set({ availableQuantity: "8.00" })
          .where(eq(batches.id, batchTomato2.id)),
        setup.db
          .update(batches)
          .set({ availableQuantity: "6.50" })
          .where(eq(batches.id, batchSpinach.id)),
      ]);

      await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/confirm`)
        .set(salesHeader)
        .expect(200);

      for (const expectedStatus of [
        OrderStatus.CONFIRMED,
        OrderStatus.PACKING,
        OrderStatus.SHIPPING,
      ] as const) {
        if (expectedStatus !== OrderStatus.CONFIRMED) {
          await request(app.getHttpServer())
            .patch(`/api/v1/orders/${order.id}/status`)
            .set(salesHeader)
            .send({ status: expectedStatus })
            .expect(200);
        }

        const res = await request(app.getHttpServer())
          .get(`/api/v1/orders/${order.id}/pick-list`)
          .set(salesHeader)
          .expect(200);

        expect(res.headers["cache-control"]).toBe("no-cache");

        const body = res.body as ApiResponse<OrderPickListResponse>;
        expect(body.success).toBe(true);
        expect(body.data.orderId).toBe(order.id);
        expect(body.data.orderCode).toBe(order.orderCode);
        expect(body.data.orderStatus).toBe(expectedStatus);
        expect(Object.keys(body.data).sort()).toEqual([
          "batches",
          "generatedAt",
          "orderCode",
          "orderId",
          "orderStatus",
        ]);
        expect(body.data.batches).toEqual([
          {
            batchId: batchTomato1.id,
            batchCode: "BATCH-PICK-TOM-1",
            expirationDate: batchTomato1.expirationDate.toISOString(),
            batchStatus: BatchStatus.SOLD_OUT,
            isExpired: false,
            productId: tomatoId,
            productName: "Cà chua bi hữu cơ",
            unit: "kg",
            allocatedQuantity: 10,
          },
          {
            batchId: batchSpinach.id,
            batchCode: "BATCH-PICK-SPN-1",
            expirationDate: batchSpinach.expirationDate.toISOString(),
            batchStatus: BatchStatus.IN_STOCK,
            isExpired: false,
            productId: spinachId,
            productName: "Cải bó xôi hữu cơ",
            unit: "kg",
            allocatedQuantity: 3.5,
          },
          {
            batchId: batchTomato2.id,
            batchCode: "BATCH-PICK-TOM-2",
            expirationDate: batchTomato2.expirationDate.toISOString(),
            batchStatus: BatchStatus.IN_STOCK,
            isExpired: false,
            productId: tomatoId,
            productName: "Cà chua bi hữu cơ",
            unit: "kg",
            allocatedQuantity: 2,
          },
        ]);
      }

      const [tom1After, spnAfter, tom2After] = await Promise.all([
        setup.db
          .select({ availableQuantity: batches.availableQuantity })
          .from(batches)
          .where(eq(batches.id, batchTomato1.id)),
        setup.db
          .select({ availableQuantity: batches.availableQuantity })
          .from(batches)
          .where(eq(batches.id, batchSpinach.id)),
        setup.db
          .select({ availableQuantity: batches.availableQuantity })
          .from(batches)
          .where(eq(batches.id, batchTomato2.id)),
      ]);

      expect(tom1After[0]?.availableQuantity).toBe("0.00");
      expect(spnAfter[0]?.availableQuantity).toBe("6.50");
      expect(tom2After[0]?.availableQuantity).toBe("8.00");
    });

    // Invariant: INV-ORD-18
    it("sums duplicate product line items allocated to the same batch and excludes soft-released allocations", async () => {
      const now = Date.now();
      const batch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        batchCode: "BATCH-PICK-SUM-1",
        harvestDate: new Date(now - 86_400_000),
        expirationDate: new Date(now + 48 * 3_600_000),
        initialQuantity: "10.00",
        availableQuantity: "6.75",
        status: BatchStatus.IN_STOCK,
      });

      const { order, items } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.CONFIRMED,
        items: [
          { productId: tomatoId, quantity: "1.25", unitPrice: 80_000 },
          { productId: tomatoId, quantity: "2.00", unitPrice: 80_000 },
        ],
      });

      await setup.db.insert(batchAllocations).values([
        {
          orderItemId: items[0]!.id,
          batchId: batch.id,
          allocatedQuantity: "1.25",
          releasedAt: null,
        },
        {
          orderItemId: items[1]!.id,
          batchId: batch.id,
          allocatedQuantity: "2.00",
          releasedAt: null,
        },
        {
          orderItemId: items[0]!.id,
          batchId: batch.id,
          allocatedQuantity: "5.00",
          releasedAt: new Date(now - 60_000),
        },
      ]);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/orders/${order.id}/pick-list`)
        .set(adminHeader)
        .expect(200);

      const body = res.body as ApiResponse<OrderPickListResponse>;
      expect(body.data.batches).toHaveLength(1);
      expect(body.data.batches[0]).toMatchObject({
        batchId: batch.id,
        batchCode: "BATCH-PICK-SUM-1",
        allocatedQuantity: 3.25,
      });
    });

    // Invariant: INV-ORD-19
    it("retains soft-deleted or deactivated products and flags post-confirmation expired batches", async () => {
      const now = Date.now();
      const batch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        batchCode: "BATCH-PICK-POSTEXP",
        harvestDate: new Date(now - 2 * 86_400_000),
        expirationDate: new Date(now + 10 * 3_600_000),
        initialQuantity: "5.00",
        availableQuantity: "5.00",
        status: BatchStatus.IN_STOCK,
      });

      const { order, items } = await createOrder(setup.db, {
        customerId,
        items: [{ productId: tomatoId, quantity: "2.00", unitPrice: 80_000 }],
      });

      await setup.db.insert(batchAllocations).values({
        orderItemId: items[0]!.id,
        batchId: batch.id,
        allocatedQuantity: "2.00",
      });
      await setup.db
        .update(batches)
        .set({ availableQuantity: "3.00" })
        .where(eq(batches.id, batch.id));

      await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/confirm`)
        .set(salesHeader)
        .expect(200);

      await setup.db
        .update(batches)
        .set({ expirationDate: new Date(now - 1_000) })
        .where(eq(batches.id, batch.id));

      await setup.db
        .update(products)
        .set({ isActive: false, deletedAt: new Date(now) })
        .where(eq(products.id, tomatoId));

      const res = await request(app.getHttpServer())
        .get(`/api/v1/orders/${order.id}/pick-list`)
        .set(salesHeader)
        .expect(200);

      const body = res.body as ApiResponse<OrderPickListResponse>;
      expect(body.data.batches).toHaveLength(1);
      expect(body.data.batches[0]).toMatchObject({
        batchId: batch.id,
        productId: tomatoId,
        productName: "Cà chua bi hữu cơ",
        isExpired: true,
        allocatedQuantity: 2,
      });
    });

    // Invariant: INV-ORD-17
    it("rejects non-pickable order statuses and pickable orders missing active allocations", async () => {
      for (const status of [
        OrderStatus.PENDING_PAYMENT,
        OrderStatus.PENDING_CONFIRMATION,
        OrderStatus.DELIVERED,
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED,
      ]) {
        const { order } = await createOrder(setup.db, {
          customerId,
          orderStatus: status,
          items: [{ productId: tomatoId, quantity: "2.00", unitPrice: 80_000 }],
        });

        const res = await request(app.getHttpServer())
          .get(`/api/v1/orders/${order.id}/pick-list`)
          .set(salesHeader)
          .expect(409);

        expect((res.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.ORDER_PICK_LIST_STATUS_INVALID,
        );
      }

      const { order: confirmedWithoutAlloc } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.CONFIRMED,
        items: [{ productId: tomatoId, quantity: "2.00", unitPrice: 80_000 }],
      });

      const missingRes = await request(app.getHttpServer())
        .get(`/api/v1/orders/${confirmedWithoutAlloc.id}/pick-list`)
        .set(salesHeader)
        .expect(409);

      expect((missingRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.ORDER_ACTIVE_ALLOCATIONS_MISSING,
      );

      const batch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        batchCode: "BATCH-PICK-RELEASED",
        harvestDate: new Date(Date.now() - 86_400_000),
        expirationDate: new Date(Date.now() + 48 * 3_600_000),
        initialQuantity: "5.00",
        availableQuantity: "5.00",
        status: BatchStatus.IN_STOCK,
      });

      const { order: releasedOnlyOrder, items: releasedOnlyItems } =
        await createOrder(setup.db, {
          customerId,
          orderStatus: OrderStatus.PACKING,
          items: [{ productId: tomatoId, quantity: "2.00", unitPrice: 80_000 }],
        });

      await setup.db.insert(batchAllocations).values({
        orderItemId: releasedOnlyItems[0]!.id,
        batchId: batch.id,
        allocatedQuantity: "2.00",
        releasedAt: new Date(),
      });

      const releasedRes = await request(app.getHttpServer())
        .get(`/api/v1/orders/${releasedOnlyOrder.id}/pick-list`)
        .set(salesHeader)
        .expect(409);

      expect((releasedRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.ORDER_ACTIVE_ALLOCATIONS_MISSING,
      );
    });

    // Invariant: INV-ORD-19
    it("reads an atomic snapshot when concurrent cancellation runs alongside pick-list fetch", async () => {
      const now = Date.now();
      const raceBatch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        batchCode: "BATCH-PICK-RACE",
        harvestDate: new Date(now - 86_400_000),
        expirationDate: new Date(now + 48 * 3_600_000),
        initialQuantity: "20.00",
        availableQuantity: "20.00",
        status: BatchStatus.IN_STOCK,
      });

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { order, items } = await createOrder(setup.db, {
          customerId,
          items: [{ productId: tomatoId, quantity: "2.00", unitPrice: 80_000 }],
        });

        await setup.db.insert(batchAllocations).values({
          orderItemId: items[0]!.id,
          batchId: raceBatch.id,
          allocatedQuantity: "2.00",
        });
        await setup.db
          .update(batches)
          .set({
            availableQuantity: sql`${batches.availableQuantity} - 2.00`,
          })
          .where(eq(batches.id, raceBatch.id));

        await request(app.getHttpServer())
          .post(`/api/v1/orders/${order.id}/confirm`)
          .set(salesHeader)
          .expect(200);

        const [pickListRes, cancelRes] = await Promise.all([
          request(app.getHttpServer())
            .get(`/api/v1/orders/${order.id}/pick-list`)
            .set(salesHeader),
          request(app.getHttpServer())
            .patch(`/api/v1/orders/${order.id}/status`)
            .set(salesHeader)
            .send({ status: OrderStatus.CANCELLED }),
        ]);

        expect(cancelRes.status).toBe(200);
        expect([200, 409]).toContain(pickListRes.status);

        if (pickListRes.status === 200) {
          const body = pickListRes.body as ApiResponse<OrderPickListResponse>;
          expect(body.data.batches).toHaveLength(1);
          expect(body.data.batches[0]?.allocatedQuantity).toBe(2);
        } else {
          expect((pickListRes.body as Rfc9457ProblemDetails).code).toBe(
            API_ERROR_CODES.ORDER_PICK_LIST_STATUS_INVALID,
          );
        }
      }
    });

    // Invariant: INV-ORD-17, INV-ORD-20
    it("enforces UUIDv7 validation, missing-order lookup, and staff RBAC across all roles", async () => {
      const now = Date.now();
      const batch = await createBatch(setup.db, {
        seasonId,
        productId: tomatoId,
        batchCode: "BATCH-PICK-RBAC",
        harvestDate: new Date(now - 86_400_000),
        expirationDate: new Date(now + 48 * 3_600_000),
        initialQuantity: "5.00",
        availableQuantity: "5.00",
        status: BatchStatus.IN_STOCK,
      });

      const { order, items } = await createOrder(setup.db, {
        customerId,
        items: [{ productId: tomatoId, quantity: "2.00", unitPrice: 80_000 }],
      });

      await setup.db.insert(batchAllocations).values({
        orderItemId: items[0]!.id,
        batchId: batch.id,
        allocatedQuantity: "2.00",
      });
      await setup.db
        .update(batches)
        .set({ availableQuantity: "3.00" })
        .where(eq(batches.id, batch.id));

      await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/confirm`)
        .set(salesHeader)
        .expect(200);

      await request(app.getHttpServer())
        .get("/api/v1/orders/not-a-uuid/pick-list")
        .set(salesHeader)
        .expect(400);

      await request(app.getHttpServer())
        .get(`/api/v1/orders/${randomUUID()}/pick-list`)
        .set(salesHeader)
        .expect(400);

      const notFoundRes = await request(app.getHttpServer())
        .get("/api/v1/orders/019fa8bc-8f4d-7000-b366-e691f45cfb99/pick-list")
        .set(salesHeader)
        .expect(404);
      expect((notFoundRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.ORDER_NOT_FOUND,
      );

      await request(app.getHttpServer())
        .get(`/api/v1/orders/${order.id}/pick-list`)
        .expect(401);

      for (const forbiddenHeader of [
        customerHeader,
        farmStaffHeader,
        guestHeader,
      ]) {
        await request(app.getHttpServer())
          .get(`/api/v1/orders/${order.id}/pick-list`)
          .set(forbiddenHeader)
          .expect(403);
      }

      for (const allowedHeader of [
        salesHeader,
        adminHeader,
        superAdminHeader,
      ]) {
        await request(app.getHttpServer())
          .get(`/api/v1/orders/${order.id}/pick-list`)
          .set(allowedHeader)
          .expect(200);
      }
    });
  });
});
