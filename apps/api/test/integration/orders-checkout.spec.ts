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
import { and, eq, sql } from "drizzle-orm";
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
  UserStatus,
} from "@greenroots/shared";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";
import { RedisService } from "@/common/services/redis.service";
import type { ApiResponse } from "@/common/utils/api-response.util";
import {
  batches,
  farms,
  orderItems,
  orders,
  payments,
  userAddresses,
  users,
} from "@/database/schemas";
import {
  FARM_SETTINGS_CACHE_KEY,
  FARM_SETTINGS_INVALIDATED_AT_KEY,
} from "@/modules/farms/farms.constant";
import {
  BatchMother,
  createBatch,
  createCategory,
  createFarm,
  createPlot,
  createProduct,
  createSeason,
  ProductMother,
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
type ValidateCartResponse = components["schemas"]["ValidateCartResponseDto"];

const QUAN_1 = HCMC_DISTRICTS.find((d) => d.code === "quan-1")!;
const CAN_GIO = HCMC_DISTRICTS.find((d) => d.code === "can-gio")!;

describe("Orders Checkout Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let jwtService: JwtService;
  let appRedisClient: ReturnType<RedisService["getClient"]>;

  let customerId: string;
  let customerHeader: { Authorization: string };
  let otherCustomerId: string;
  let otherCustomerHeader: { Authorization: string };
  let guestHeader: { Authorization: string };
  let salesHeader: { Authorization: string };

  let farmId: string;
  let seasonId: string;
  let categoryId: string;
  let regularProductId: string;
  let markdownProductId: string;
  let inactiveProductId: string;
  let deliverableAddressId: string;
  let outOfRadiusAddressId: string;
  let otherAddressId: string;

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

    const [customerSession, otherCustomerSession, guestSession, salesSession] =
      await Promise.all([
        createAuthenticatedUser(setup.db, jwtService, {
          role: UserRole.CUSTOMER,
          rewardPoints: 50_000,
        }),
        createAuthenticatedUser(setup.db, jwtService, {
          role: UserRole.CUSTOMER,
          rewardPoints: 10_000,
        }),
        createAuthenticatedUser(setup.db, jwtService, {
          role: UserRole.GUEST,
        }),
        createAuthenticatedAdmin(setup.db, jwtService, UserRole.SALES),
      ]);

    customerId = customerSession.user.id;
    customerHeader = customerSession.authHeader;
    otherCustomerId = otherCustomerSession.user.id;
    otherCustomerHeader = otherCustomerSession.authHeader;
    guestHeader = guestSession.authHeader;
    salesHeader = salesSession.authHeader;

    const farm = await createFarm(setup.db);
    farmId = farm.id;
    const plot = await createPlot(setup.db, { farmId });
    const season = await createSeason(setup.db, { plotId: plot.id });
    seasonId = season.id;

    const category = await createCategory(setup.db);
    categoryId = category.id;

    const regularProduct = await createProduct(setup.db, {
      categoryId,
      name: "Cà chua bi hữu cơ",
      slug: "ca-chua-bi-huu-co",
      basePrice: 80_000,
      salePrice: null,
      unit: "kg",
    });
    regularProductId = regularProduct.id;

    const markdownProduct = await createProduct(
      setup.db,
      ProductMother.vietGapMarkdown({
        categoryId,
        name: "Cải bó xôi",
        slug: "cai-bo-xoi",
        basePrice: 50_000,
        salePrice: 35_000,
        unit: "kg",
      }),
    );
    markdownProductId = markdownProduct.id;

    const inactiveProduct = await createProduct(
      setup.db,
      ProductMother.inactive({
        categoryId,
        name: "Rau mùa cũ",
        slug: "rau-mua-cu",
        basePrice: 40_000,
      }),
    );
    inactiveProductId = inactiveProduct.id;

    await Promise.all([
      createBatch(setup.db, {
        seasonId,
        productId: regularProductId,
        initialQuantity: "10.00",
        availableQuantity: "5.00",
      }),
      createBatch(setup.db, {
        seasonId,
        productId: markdownProductId,
        initialQuantity: "10.00",
        availableQuantity: "4.00",
      }),
      // Expired batch must be ignored in live stock aggregation
      createBatch(
        setup.db,
        BatchMother.expired({
          seasonId,
          productId: regularProductId,
          initialQuantity: "20.00",
          availableQuantity: "20.00",
        }),
      ),
    ]);

    const [addr1, addr2, addr3] = await setup.db
      .insert(userAddresses)
      .values([
        {
          userId: customerId,
          receiverName: "Trần Thị Khách",
          phoneNumber: "0912345678",
          streetAddress: "123 Lê Lợi",
          districtCode: QUAN_1.code,
          district: QUAN_1.name,
          city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
          latitude: QUAN_1.latitude.toFixed(8),
          longitude: QUAN_1.longitude.toFixed(8),
          isDefault: true,
        },
        {
          userId: customerId,
          receiverName: "Trần Thị Khách",
          phoneNumber: "0912345678",
          streetAddress: "99 Rừng Sác",
          districtCode: CAN_GIO.code,
          district: CAN_GIO.name,
          city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
          latitude: CAN_GIO.latitude.toFixed(8),
          longitude: CAN_GIO.longitude.toFixed(8),
          isDefault: false,
        },
        {
          userId: otherCustomerId,
          receiverName: "Người Dùng Khác",
          phoneNumber: "0987654321",
          streetAddress: "45 Lê Lợi",
          districtCode: QUAN_1.code,
          district: QUAN_1.name,
          city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
          latitude: QUAN_1.latitude.toFixed(8),
          longitude: QUAN_1.longitude.toFixed(8),
          isDefault: true,
        },
      ])
      .returning({ id: userAddresses.id });

    deliverableAddressId = addr1!.id;
    outOfRadiusAddressId = addr2!.id;
    otherAddressId = addr3!.id;
  });

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  describe("POST /api/v1/orders/validate-cart", () => {
    // Invariant: INV-ORD-1, INV-ORD-4
    it("normalizes duplicate items, recomputes catalog prices, returns stock, shipping, loyalty cap, and MOV status", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/orders/validate-cart")
        .set(customerHeader)
        .send({
          items: [
            { productId: markdownProductId, quantity: 1 },
            { productId: regularProductId, quantity: 1 },
            { productId: regularProductId, quantity: 0.5 },
          ],
          districtCode: QUAN_1.code,
          loyaltyPoints: 999_999,
          clientTotalVnd: 1000,
        })
        .expect(200);

      const payload = (res.body as ApiResponse<ValidateCartResponse>).data;

      // regular: 1.5 * 80,000 = 120,000; markdown: 1 * 35,000 = 35,000 -> subtotal = 155,000
      expect(payload.subtotalVnd).toBe(155_000);
      expect(payload.minOrderValueVnd).toBe(150_000);
      expect(payload.meetsMinOrderValue).toBe(true);
      expect(payload.availableLoyaltyPoints).toBe(50_000);
      expect(payload.appliedLoyaltyPoints).toBe(50_000);
      expect(payload.discountAmountVnd).toBe(50_000);
      expect(payload.shipping).not.toBeNull();
      expect(payload.shipping?.isDeliverable).toBe(true);
      expect(payload.totalAmountVnd).toBe(
        155_000 - 50_000 + (payload.shipping?.feeVnd ?? 0),
      );
      expect(payload.isValid).toBe(true);
      expect(payload.items).toHaveLength(2);
    });

    it("returns diagnostic summary with item issues and null shipping when customer has no saved address", async () => {
      await setup.db
        .delete(userAddresses)
        .where(eq(userAddresses.userId, customerId));

      const res = await request(app.getHttpServer())
        .post("/api/v1/orders/validate-cart")
        .set(customerHeader)
        .send({
          items: [
            { productId: regularProductId, quantity: 99 },
            { productId: inactiveProductId, quantity: 1 },
          ],
        })
        .expect(200);

      const payload = (res.body as ApiResponse<ValidateCartResponse>).data;
      expect(payload.shipping).toBeNull();
      expect(payload.isValid).toBe(false);

      const regularItem = payload.items.find(
        (i) => i.productId === regularProductId,
      );
      const inactiveItem = payload.items.find(
        (i) => i.productId === inactiveProductId,
      );
      expect(regularItem?.issue).toBe("INSUFFICIENT_STOCK");
      expect(regularItem?.availableQuantity).toBe(5);
      expect(inactiveItem?.issue).toBe("PRODUCT_UNAVAILABLE");
    });

    it("rejects non-customer roles and unauthenticated callers", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/orders/validate-cart")
        .send({ items: [{ productId: regularProductId, quantity: 2 }] })
        .expect(401);

      await request(app.getHttpServer())
        .post("/api/v1/orders/validate-cart")
        .set(guestHeader)
        .send({ items: [{ productId: regularProductId, quantity: 2 }] })
        .expect(403);

      await request(app.getHttpServer())
        .post("/api/v1/orders/validate-cart")
        .set(salesHeader)
        .send({ items: [{ productId: regularProductId, quantity: 2 }] })
        .expect(403);
    });
  });

  describe("POST /api/v1/orders/checkout", () => {
    it("rejects unauthenticated, non-customer, and suspended callers", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set("Idempotency-Key", randomUUID())
        .send({ items: [{ productId: regularProductId, quantity: 2 }] })
        .expect(401);

      await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(guestHeader)
        .set("Idempotency-Key", randomUUID())
        .send({ items: [{ productId: regularProductId, quantity: 2 }] })
        .expect(403);

      await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(salesHeader)
        .set("Idempotency-Key", randomUUID())
        .send({ items: [{ productId: regularProductId, quantity: 2 }] })
        .expect(403);

      await setup.db
        .update(users)
        .set({ status: UserStatus.SUSPENDED })
        .where(eq(users.id, customerId));

      const suspendedRes = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({ items: [{ productId: regularProductId, quantity: 2 }] })
        .expect(403);

      expect((suspendedRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED,
      );
    });

    it("rejects missing or non-UUID Idempotency-Key headers", async () => {
      const missingRes = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .send({ items: [{ productId: regularProductId, quantity: 2 }] })
        .expect(400);

      expect((missingRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.VALIDATION_FAILED,
      );

      const invalidRes = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", "not-a-uuid")
        .send({ items: [{ productId: regularProductId, quantity: 2 }] })
        .expect(400);

      expect((invalidRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.VALIDATION_FAILED,
      );
    });

    // Invariant: INV-ORD-1, INV-ORD-4, INV-ORD-5
    it("creates COD order atomically with pending confirmation status, payment ledger row, loyalty cap, and intact batch stock", async () => {
      const idempotencyKey = randomUUID();

      const res = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", idempotencyKey)
        .send({
          items: [
            { productId: regularProductId, quantity: 2 }, // 160,000
            { productId: markdownProductId, quantity: 1 }, // 35,000
          ],
          addressId: deliverableAddressId,
          loyaltyPoints: 90_000, // exceeds balance 50,000
          clientTotalVnd: 1, // tampered client total ignored
        })
        .expect(201);

      const created = (res.body as ApiResponse<OrderResponse>).data;

      expect(created.orderCode).toMatch(/^ORD-\d{8}-[0-9A-HJKMNP-TV-Z]{6}$/);
      expect(created.orderStatus).toBe(OrderStatus.PENDING_CONFIRMATION);
      expect(created.paymentMethod).toBe(PaymentMethod.COD);
      expect(created.paymentStatus).toBe(PaymentStatus.PENDING);
      expect(created.receiverName).toBe("Trần Thị Khách");
      expect(created.receiverPhone).toBe("0912345678");
      expect(created.shippingAddress).toContain("123 Lê Lợi");
      expect(created.subtotalVnd).toBe(195_000);
      expect(created.loyaltyPointsUsed).toBe(50_000);
      expect(created.discountAmountVnd).toBe(50_000);
      expect(created.totalAmountVnd).toBe(
        195_000 - 50_000 + created.shippingFeeVnd,
      );
      expect(created.items).toHaveLength(2);
      expect(created.items[0]?.productImageUrl).toMatch(
        /^https:\/\/res\.cloudinary\.com\//,
      );

      // Verify customer rewardPoints decremented
      const [userRow] = await setup.db
        .select({ rewardPoints: users.rewardPoints })
        .from(users)
        .where(eq(users.id, customerId));
      expect(userRow?.rewardPoints).toBe(0);

      // Verify paired payments ledger row created
      const [paymentRow] = await setup.db
        .select()
        .from(payments)
        .where(eq(payments.orderId, created.id));
      expect(paymentRow).toBeDefined();
      expect(paymentRow?.paymentMethod).toBe(PaymentMethod.COD);
      expect(paymentRow?.status).toBe(PaymentStatus.PENDING);
      expect(paymentRow?.transactionType).toBe(PaymentTransactionType.PAYMENT);
      expect(paymentRow?.amount).toBe(created.totalAmountVnd);

      // Verify batch stock untouched (#86 deferred allocation)
      const [batchRow] = await setup.db
        .select({ availableQuantity: batches.availableQuantity })
        .from(batches)
        .where(
          and(
            eq(batches.productId, regularProductId),
            eq(batches.status, BatchStatus.IN_STOCK),
          ),
        )
        .limit(1);
      expect(Number(batchRow?.availableQuantity)).toBe(5);
    });

    // Invariant: INV-ORD-4
    it("caps loyalty deduction at merchandise subtotal without deducting shipping fee", async () => {
      await setup.db
        .update(users)
        .set({ rewardPoints: 500_000 })
        .where(eq(users.id, customerId));

      const res = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          items: [{ productId: regularProductId, quantity: 2 }], // 160,000
          loyaltyPoints: 500_000,
        })
        .expect(201);

      const created = (res.body as ApiResponse<OrderResponse>).data;
      expect(created.subtotalVnd).toBe(160_000);
      expect(created.loyaltyPointsUsed).toBe(160_000);
      expect(created.discountAmountVnd).toBe(160_000);
      expect(created.shippingFeeVnd).toBeGreaterThan(0);
      expect(created.totalAmountVnd).toBe(created.shippingFeeVnd);

      const [userRow] = await setup.db
        .select({ rewardPoints: users.rewardPoints })
        .from(users)
        .where(eq(users.id, customerId));
      expect(userRow?.rewardPoints).toBe(340_000);
    });

    // Invariant: INV-ORD-2
    it("rejects orders below minimum order value and persists no rows", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          items: [{ productId: markdownProductId, quantity: 4 }], // 4 * 35,000 = 140,000 < 150,000
        })
        .expect(422);

      const problem = res.body as Rfc9457ProblemDetails;
      expect(problem.code).toBe(API_ERROR_CODES.ORDER_BELOW_MINIMUM_VALUE);
      expect(problem.invalidParams[0]?.params?.["minOrderValueVnd"]).toBe(
        150_000,
      );
      expect(problem.invalidParams[0]?.params?.["currentSubtotalVnd"]).toBe(
        140_000,
      );

      const persistedOrders = await setup.db.select().from(orders);
      expect(persistedOrders).toHaveLength(0);
    });

    // Invariant: INV-ORD-3
    it("rejects undeliverable addresses outside delivery radius with maximum radius parameter", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          items: [{ productId: regularProductId, quantity: 2 }],
          addressId: outOfRadiusAddressId,
        })
        .expect(422);

      const problem = res.body as Rfc9457ProblemDetails;
      expect(problem.code).toBe(API_ERROR_CODES.OUT_OF_DELIVERY_RADIUS);
      expect(problem.invalidParams[0]?.params?.["maxRadiusKm"]).toBe(
        BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM,
      );
    });

    it("rejects checkout when requested quantity exceeds live sellable stock", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          items: [{ productId: regularProductId, quantity: 6 }], // available is 5
        })
        .expect(409);

      const problem = res.body as Rfc9457ProblemDetails;
      expect(problem.code).toBe(API_ERROR_CODES.INSUFFICIENT_STOCK);
    });

    it("rejects COD checkout when farm COD setting is disabled", async () => {
      await setup.db
        .update(farms)
        .set({ isCodEnabled: false })
        .where(eq(farms.id, farmId));

      const res = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          items: [{ productId: regularProductId, quantity: 2 }],
        })
        .expect(422);

      const problem = res.body as Rfc9457ProblemDetails;
      expect(problem.code).toBe(API_ERROR_CODES.ORDER_COD_DISABLED);
    });

    it("rejects foreign address identifiers owned by another customer", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          items: [{ productId: regularProductId, quantity: 2 }],
          addressId: otherAddressId,
        })
        .expect(404);

      const problem = res.body as Rfc9457ProblemDetails;
      expect(problem.code).toBe(API_ERROR_CODES.ADDRESS_NOT_FOUND);
    });

    // Invariant: INV-ORD-6
    it("replays identical key, rejects payload mismatch, and isolates keys across customer accounts", async () => {
      const sharedKey = randomUUID();
      const payload = {
        items: [{ productId: regularProductId, quantity: 2 }],
        loyaltyPoints: 10_000,
      };

      const res1 = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", sharedKey)
        .send(payload)
        .expect(201);

      const res2 = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", sharedKey)
        .send(payload)
        .expect(201);

      const order1 = (res1.body as ApiResponse<OrderResponse>).data;
      const order2 = (res2.body as ApiResponse<OrderResponse>).data;
      expect(order2.id).toBe(order1.id);
      expect(order2.orderCode).toBe(order1.orderCode);

      await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", sharedKey)
        .send({
          items: [{ productId: regularProductId, quantity: 3 }],
          loyaltyPoints: 10_000,
        })
        .expect(422);

      // Different user reusing the exact same UUID + payload executes independently (no PII leak)
      const resOther = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(otherCustomerHeader)
        .set("Idempotency-Key", sharedKey)
        .send(payload)
        .expect(201);

      const otherOrder = (resOther.body as ApiResponse<OrderResponse>).data;
      expect(otherOrder.id).not.toBe(order1.id);
      expect(otherOrder.receiverName).toBe("Người Dùng Khác");
      expect(otherOrder.receiverPhone).toBe("0987654321");

      // Deleting saved address preserves receiver contact and shipping address snapshots on persisted order
      await request(app.getHttpServer())
        .delete(`/api/v1/users/me/addresses/${deliverableAddressId}`)
        .set(customerHeader)
        .expect(204);

      const [persistedOrder] = await setup.db
        .select({
          receiverName: orders.receiverName,
          receiverPhone: orders.receiverPhone,
          shippingAddress: orders.shippingAddress,
        })
        .from(orders)
        .where(eq(orders.id, order1.id));
      expect(persistedOrder?.receiverName).toBe("Trần Thị Khách");
      expect(persistedOrder?.receiverPhone).toBe("0912345678");
      expect(persistedOrder?.shippingAddress).toContain("123 Lê Lợi");
    });

    // Invariant: INV-ORD-6
    it("releases idempotency key after failed checkout so immediate retry with replenished stock succeeds", async () => {
      const key = randomUUID();
      const payload = {
        items: [{ productId: regularProductId, quantity: 6 }],
      };

      await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", key)
        .send(payload)
        .expect(409);

      // Replenish stock, then retry immediately with the same Idempotency-Key
      await createBatch(setup.db, {
        seasonId,
        productId: regularProductId,
        initialQuantity: "5.00",
        availableQuantity: "5.00",
      });

      const retryRes = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", key)
        .send(payload)
        .expect(201);

      expect(
        (retryRes.body as ApiResponse<OrderResponse>).data.id,
      ).toBeDefined();
    });

    // Invariant: INV-ORD-6
    it("fails closed when Redis is unavailable during idempotency acquisition", async () => {
      const redisService = app.get(RedisService);
      const client = redisService.getClient();
      const originalSet = client.set.bind(client);
      client.set = () => Promise.reject(new Error("Redis ECONNREFUSED"));

      try {
        await request(app.getHttpServer())
          .post("/api/v1/orders/checkout")
          .set(customerHeader)
          .set("Idempotency-Key", randomUUID())
          .send({
            items: [{ productId: regularProductId, quantity: 2 }],
          })
          .expect(503);
      } finally {
        client.set = originalSet;
      }
    });

    // Invariant: INV-ORD-4, INV-ORD-6
    it("serializes parallel same-key and distinct-key concurrent checkouts without negative rewardPoints", async () => {
      // Case A: parallel contenders sharing one Idempotency-Key
      const contestedKey = randomUUID();
      const sameKeyResults = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app.getHttpServer())
            .post("/api/v1/orders/checkout")
            .set(customerHeader)
            .set("Idempotency-Key", contestedKey)
            .send({
              items: [{ productId: regularProductId, quantity: 2 }],
              loyaltyPoints: 20_000,
            }),
        ),
      );

      const createdStatuses = sameKeyResults.filter((r) => r.status === 201);
      expect(createdStatuses.length).toBeGreaterThanOrEqual(1);
      for (const res of sameKeyResults) {
        expect([201, 409]).toContain(res.status);
      }

      // Case B: parallel distinct-key checkouts each requesting 20,000 points
      const distinctResults = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(app.getHttpServer())
            .post("/api/v1/orders/checkout")
            .set(customerHeader)
            .set("Idempotency-Key", randomUUID())
            .send({
              items: [{ productId: regularProductId, quantity: 2 }],
              loyaltyPoints: 20_000,
            }),
        ),
      );

      for (const res of distinctResults) {
        expect(res.status).toBe(201);
      }

      const [userRow] = await setup.db
        .select({ rewardPoints: users.rewardPoints })
        .from(users)
        .where(eq(users.id, customerId));
      expect(userRow?.rewardPoints).toBe(0);

      const persistedOrders = await setup.db
        .select({ loyaltyPointsUsed: orders.loyaltyPointsUsed })
        .from(orders)
        .where(eq(orders.customerId, customerId));
      const totalUsed = persistedOrders.reduce(
        (sum, o) => sum + o.loyaltyPointsUsed,
        0,
      );
      expect(totalUsed).toBe(50_000);

      const persistedItems = await setup.db.select().from(orderItems);
      expect(persistedItems.length).toBe(persistedOrders.length);
    });
  });
});
