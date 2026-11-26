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
  DeliveryDay,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  SubscriptionStatus,
  UserRole,
  UserStatus,
} from "@greenroots/shared";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";
import type { ApiResponse } from "@/common/utils/api-response.util";
import {
  batchAllocations,
  orderItems,
  orders,
  payments,
  products,
  subscriptions,
  users,
} from "@/database/schemas";
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
type PaginationMeta = components["schemas"]["PaginationMetaDto"];

describe("Orders History Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let jwtService: JwtService;

  let customerId: string;
  let customerHeader: { Authorization: string };
  let otherCustomerId: string;
  let otherCustomerHeader: { Authorization: string };
  let guestHeader: { Authorization: string };
  let salesId: string;
  let salesHeader: { Authorization: string };
  let adminHeader: { Authorization: string };
  let farmStaffHeader: { Authorization: string };
  let superAdminHeader: { Authorization: string };

  let productWithImageId: string;
  let productWithImageUrl: string;
  let productWithoutImageId: string;
  let softDeletedProductId: string;
  let inactiveProductId: string;
  let batchId: string;

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    jwtService = app.get(JwtService);
  }, 30000);

  beforeEach(async () => {
    await setup.db.execute(
      sql`TRUNCATE TABLE "payments", "batch_allocations", "order_items", "orders", "subscriptions", "subscription_plans", "batches", "products", "categories", "seasons", "plots", "farms", "user_addresses", "users" CASCADE;`,
    );
    await cleanScopedRedisKeys(setup.redisClient);

    const [
      customerSession,
      otherCustomerSession,
      guestSession,
      salesSession,
      adminSession,
      farmStaffSession,
      superAdminSession,
    ] = await Promise.all([
      createAuthenticatedUser(setup.db, jwtService, {
        role: UserRole.CUSTOMER,
      }),
      createAuthenticatedUser(setup.db, jwtService, {
        role: UserRole.CUSTOMER,
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
    otherCustomerId = otherCustomerSession.user.id;
    otherCustomerHeader = otherCustomerSession.authHeader;
    guestHeader = guestSession.authHeader;
    salesId = salesSession.user.id;
    salesHeader = salesSession.authHeader;
    adminHeader = adminSession.authHeader;
    farmStaffHeader = farmStaffSession.authHeader;
    superAdminHeader = superAdminSession.authHeader;

    const farm = await createFarm(setup.db);
    const plot = await createPlot(setup.db, { farmId: farm.id });
    const season = await createSeason(setup.db, { plotId: plot.id });
    const category = await createCategory(setup.db);

    const p1 = await createProduct(setup.db, {
      categoryId: category.id,
      name: "Cải ngọt hữu cơ",
      slug: "cai-ngot-huu-co",
      basePrice: 40_000,
      unit: "kg",
    });
    productWithImageId = p1.id;
    productWithImageUrl = p1.imageUrls?.[0] ?? "";

    const p2 = await createProduct(setup.db, {
      categoryId: category.id,
      name: "Bí đỏ hồ lô",
      slug: "bi-do-ho-lo",
      basePrice: 50_000,
      unit: "kg",
      imageUrls: null,
    });
    productWithoutImageId = p2.id;

    const p3 = await createProduct(setup.db, {
      categoryId: category.id,
      name: "Dưa leo baby",
      slug: "dua-leo-baby",
      basePrice: 45_000,
      unit: "kg",
    });
    softDeletedProductId = p3.id;

    const p4 = await createProduct(setup.db, {
      categoryId: category.id,
      name: "Xà lách tím",
      slug: "xa-lach-tim",
      basePrice: 60_000,
      unit: "kg",
    });
    inactiveProductId = p4.id;

    const batch = await createBatch(setup.db, {
      seasonId: season.id,
      productId: productWithImageId,
      initialQuantity: "20.00",
      availableQuantity: "15.00",
    });
    batchId = batch.id;
  });

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  async function seedOrder(params: {
    customerId: string;
    orderCode: string;
    orderStatus?: OrderStatus;
    paymentMethod?: PaymentMethod;
    paymentStatus?: PaymentStatus;
    subscriptionId?: string | null;
    subtotal?: number;
    discountAmount?: number;
    loyaltyPointsUsed?: number;
    shippingFee?: number;
    totalAmount?: number;
    createdAt?: Date;
    items: { productId: string; quantity: string; unitPrice: number }[];
    withInternalRecords?: boolean;
  }): Promise<string> {
    const createdAt = params.createdAt ?? new Date();
    const subtotal = params.subtotal ?? 160_000;
    const discountAmount = params.discountAmount ?? 0;
    const loyaltyPointsUsed = params.loyaltyPointsUsed ?? 0;
    const shippingFee = params.shippingFee ?? 25_000;
    const totalAmount =
      params.totalAmount ?? subtotal - discountAmount + shippingFee;

    const [insertedOrder] = await setup.db
      .insert(orders)
      .values({
        orderCode: params.orderCode,
        customerId: params.customerId,
        subscriptionId: params.subscriptionId ?? null,
        receiverName: "Nguyễn Thị Khách",
        receiverPhone: "0912345678",
        shippingAddress: "123 Lê Lợi, Quận 1, TP. Hồ Chí Minh",
        shippingDistanceKm: "8.50",
        shippingFee,
        subtotal,
        discountAmount,
        loyaltyPointsUsed,
        totalAmount,
        paymentMethod: params.paymentMethod ?? PaymentMethod.COD,
        paymentStatus: params.paymentStatus ?? PaymentStatus.PENDING,
        orderStatus: params.orderStatus ?? OrderStatus.PENDING_CONFIRMATION,
        createdAt,
        updatedAt: createdAt,
      })
      .returning({ id: orders.id });

    const orderId = insertedOrder!.id;

    const insertedItems = await setup.db
      .insert(orderItems)
      .values(
        params.items.map((item) => ({
          orderId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      )
      .returning({ id: orderItems.id });

    if (params.withInternalRecords) {
      await setup.db.insert(batchAllocations).values({
        orderItemId: insertedItems[0]!.id,
        batchId,
        allocatedQuantity: params.items[0]!.quantity,
      });

      await setup.db.insert(payments).values({
        orderId,
        amount: totalAmount,
        paymentMethod: params.paymentMethod ?? PaymentMethod.PAYOS,
        status: PaymentStatus.PAID,
        transactionType: PaymentTransactionType.PAYMENT,
        orderCode: Number(Date.now() % 1_000_000_000),
        referenceCode: `PAYOS-REF-${params.orderCode}`,
        paymentUrl: `https://pay.payos.vn/web/${params.orderCode}`,
        rawPayload: {
          code: "00",
          signature: "internal-gateway-secret-signature",
          costPriceVnd: 99_000,
        },
        verifiedBy: salesId,
        paidAt: new Date(),
      });
    }

    return orderId;
  }

  describe("GET /api/v1/orders/me", () => {
    it("returns an empty paginated envelope when the customer has no orders", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/orders/me")
        .set(customerHeader)
        .expect(200);

      const body = res.body as ApiResponse<OrderResponse[], PaginationMeta>;
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.meta).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });

    // Invariant: INV-ORD-7
    it("paginates, filters by status, sorts deterministically, and isolates orders by JWT sub", async () => {
      const t1 = new Date("2026-11-20T08:00:00.000Z");
      const t2 = new Date("2026-11-20T09:00:00.000Z");
      const t3 = new Date("2026-11-20T10:00:00.000Z");

      await seedOrder({
        customerId,
        orderCode: "ORD-20261120-000001",
        orderStatus: OrderStatus.PENDING_CONFIRMATION,
        subtotal: 160_000,
        totalAmount: 185_000,
        createdAt: t1,
        items: [
          {
            productId: productWithImageId,
            quantity: "4.00",
            unitPrice: 40_000,
          },
        ],
      });
      await seedOrder({
        customerId,
        orderCode: "ORD-20261120-000002",
        orderStatus: OrderStatus.PACKING,
        subtotal: 250_000,
        totalAmount: 275_000,
        createdAt: t2,
        items: [
          {
            productId: productWithoutImageId,
            quantity: "5.00",
            unitPrice: 50_000,
          },
        ],
      });
      await seedOrder({
        customerId,
        orderCode: "ORD-20261120-000003",
        orderStatus: OrderStatus.PENDING_CONFIRMATION,
        subtotal: 200_000,
        totalAmount: 225_000,
        createdAt: t3,
        items: [
          {
            productId: productWithImageId,
            quantity: "5.00",
            unitPrice: 40_000,
          },
        ],
      });
      // Seed foreign customer order that must never leak into customer's list
      await seedOrder({
        customerId: otherCustomerId,
        orderCode: "ORD-20261120-OTHER1",
        orderStatus: OrderStatus.PENDING_CONFIRMATION,
        subtotal: 300_000,
        totalAmount: 325_000,
        createdAt: t3,
        items: [
          {
            productId: productWithImageId,
            quantity: "7.50",
            unitPrice: 40_000,
          },
        ],
      });

      const page1Res = await request(app.getHttpServer())
        .get("/api/v1/orders/me?page=1&limit=2&sort=createdAt:desc")
        .set(customerHeader)
        .expect(200);

      const page1 = page1Res.body as ApiResponse<
        OrderResponse[],
        PaginationMeta
      >;
      expect(page1.meta).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
        hasNextPage: true,
        hasPrevPage: false,
      });
      expect(page1.data.map((o) => o.orderCode)).toEqual([
        "ORD-20261120-000003",
        "ORD-20261120-000002",
      ]);

      const page2Res = await request(app.getHttpServer())
        .get("/api/v1/orders/me?page=2&limit=2&sort=createdAt:desc")
        .set(customerHeader)
        .expect(200);
      const page2 = page2Res.body as ApiResponse<
        OrderResponse[],
        PaginationMeta
      >;
      expect(page2.data.map((o) => o.orderCode)).toEqual([
        "ORD-20261120-000001",
      ]);
      expect(page2.meta?.hasNextPage).toBe(false);
      expect(page2.meta?.hasPrevPage).toBe(true);

      const beyondRes = await request(app.getHttpServer())
        .get("/api/v1/orders/me?page=5&limit=2")
        .set(customerHeader)
        .expect(200);
      const beyond = beyondRes.body as ApiResponse<
        OrderResponse[],
        PaginationMeta
      >;
      expect(beyond.data).toEqual([]);
      expect(beyond.meta?.total).toBe(3);

      const filteredRes = await request(app.getHttpServer())
        .get(
          `/api/v1/orders/me?status=${OrderStatus.PENDING_CONFIRMATION}&sort=totalAmount:asc`,
        )
        .set(customerHeader)
        .expect(200);
      const filtered = filteredRes.body as ApiResponse<
        OrderResponse[],
        PaginationMeta
      >;
      expect(filtered.meta?.total).toBe(2);
      expect(filtered.data.map((o) => o.orderCode)).toEqual([
        "ORD-20261120-000001",
        "ORD-20261120-000003",
      ]);

      const multiStatusRes = await request(app.getHttpServer())
        .get(
          `/api/v1/orders/me?statuses=${OrderStatus.PENDING_CONFIRMATION},${OrderStatus.PACKING}&sort=createdAt:asc`,
        )
        .set(customerHeader)
        .expect(200);
      const multiStatus = multiStatusRes.body as ApiResponse<
        OrderResponse[],
        PaginationMeta
      >;
      expect(multiStatus.meta?.total).toBe(3);
      expect(multiStatus.data.map((o) => o.orderCode)).toEqual([
        "ORD-20261120-000001",
        "ORD-20261120-000002",
        "ORD-20261120-000003",
      ]);

      await request(app.getHttpServer())
        .get(
          `/api/v1/orders/me?status=${OrderStatus.PENDING_CONFIRMATION}&statuses=${OrderStatus.PACKING}`,
        )
        .set(customerHeader)
        .expect(400);

      const sortedDescRes = await request(app.getHttpServer())
        .get("/api/v1/orders/me?sort=totalAmount:desc")
        .set(customerHeader)
        .expect(200);
      expect(
        (
          sortedDescRes.body as ApiResponse<OrderResponse[], PaginationMeta>
        ).data.map((o) => o.orderCode),
      ).toEqual([
        "ORD-20261120-000002",
        "ORD-20261120-000003",
        "ORD-20261120-000001",
      ]);

      const sortedCreatedAscRes = await request(app.getHttpServer())
        .get("/api/v1/orders/me?sort=createdAt:asc")
        .set(customerHeader)
        .expect(200);
      expect(
        (
          sortedCreatedAscRes.body as ApiResponse<
            OrderResponse[],
            PaginationMeta
          >
        ).data.map((o) => o.orderCode),
      ).toEqual([
        "ORD-20261120-000001",
        "ORD-20261120-000002",
        "ORD-20261120-000003",
      ]);
    });

    it("orders ties deterministically by descending order id across paginated slices", async () => {
      const sameTime = new Date("2026-11-21T05:00:00.000Z");
      const firstId = await seedOrder({
        customerId,
        orderCode: "ORD-20261121-TIE001",
        subtotal: 160_000,
        totalAmount: 185_000,
        createdAt: sameTime,
        items: [
          {
            productId: productWithImageId,
            quantity: "4.00",
            unitPrice: 40_000,
          },
        ],
      });
      const secondId = await seedOrder({
        customerId,
        orderCode: "ORD-20261121-TIE002",
        subtotal: 160_000,
        totalAmount: 185_000,
        createdAt: sameTime,
        items: [
          {
            productId: productWithImageId,
            quantity: "4.00",
            unitPrice: 40_000,
          },
        ],
      });

      const expectedIdsDesc = [firstId, secondId].sort((a, b) =>
        b.localeCompare(a),
      );

      const page1 = await request(app.getHttpServer())
        .get("/api/v1/orders/me?page=1&limit=1&sort=createdAt:desc")
        .set(customerHeader)
        .expect(200);
      const page2 = await request(app.getHttpServer())
        .get("/api/v1/orders/me?page=2&limit=1&sort=createdAt:desc")
        .set(customerHeader)
        .expect(200);

      expect([
        (page1.body as ApiResponse<OrderResponse[], PaginationMeta>).data[0]
          ?.id,
        (page2.body as ApiResponse<OrderResponse[], PaginationMeta>).data[0]
          ?.id,
      ]).toEqual(expectedIdsDesc);
    });

    // Invariant: INV-ORD-7
    it("rejects unknown query params, spoofed customerId, and out-of-range pagination values", async () => {
      const spoofed = await request(app.getHttpServer())
        .get(`/api/v1/orders/me?customerId=${otherCustomerId}`)
        .set(customerHeader)
        .expect(400);
      expect((spoofed.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.VALIDATION_FAILED,
      );

      await request(app.getHttpServer())
        .get("/api/v1/orders/me?limit=101")
        .set(customerHeader)
        .expect(400);

      await request(app.getHttpServer())
        .get("/api/v1/orders/me?page=0")
        .set(customerHeader)
        .expect(400);

      await request(app.getHttpServer())
        .get("/api/v1/orders/me?status=invalid_status")
        .set(customerHeader)
        .expect(400);

      await request(app.getHttpServer())
        .get("/api/v1/orders/me?sort=orderCode:asc")
        .set(customerHeader)
        .expect(400);
    });

    // Invariant: INV-ORD-8, INV-ORD-10
    it("excludes internal payment and allocation fields while preserving deactivated or soft-deleted product items and subscription orders", async () => {
      const [subRow] = await setup.db
        .insert(subscriptions)
        .values({
          customerId,
          shippingAddress: "123 Lê Lợi, Quận 1, TP. Hồ Chí Minh",
          shippingDistanceKm: "8.50",
          shippingFeePerDelivery: 0,
          planName: "Gói Rau Hữu Cơ Tuần",
          price: 400_000,
          totalDeliveries: 4,
          weightPerDeliveryKg: "3.00",
          basketDescription: "Rau ăn lá theo mùa",
          deliveryDay: DeliveryDay.TUESDAY,
          remainingDeliveries: 3,
          status: SubscriptionStatus.ACTIVE,
          startDate: "2026-11-01",
          endDate: "2026-12-01",
        })
        .returning({ id: subscriptions.id });

      await seedOrder({
        customerId,
        orderCode: "ORD-20261121-CLOSED1",
        orderStatus: OrderStatus.PACKING,
        paymentMethod: PaymentMethod.SUBSCRIPTION,
        paymentStatus: PaymentStatus.PAID,
        subscriptionId: subRow!.id,
        subtotal: 210_000,
        shippingFee: 0,
        totalAmount: 210_000,
        withInternalRecords: true,
        items: [
          {
            productId: productWithImageId,
            quantity: "1.50",
            unitPrice: 40_000,
          },
          {
            productId: softDeletedProductId,
            quantity: "2.00",
            unitPrice: 45_000,
          },
          { productId: inactiveProductId, quantity: "1.00", unitPrice: 60_000 },
        ],
      });

      await setup.db
        .update(products)
        .set({ deletedAt: new Date() })
        .where(eq(products.id, softDeletedProductId));
      await setup.db
        .update(products)
        .set({ isActive: false })
        .where(eq(products.id, inactiveProductId));

      const res = await request(app.getHttpServer())
        .get("/api/v1/orders/me")
        .set(customerHeader)
        .expect(200);

      const list = (res.body as ApiResponse<OrderResponse[], PaginationMeta>)
        .data;
      expect(list).toHaveLength(1);
      const order = list[0]! as unknown as Record<string, unknown>;

      expect(order["customerId"]).toBeUndefined();
      expect(order["subscriptionId"]).toBeUndefined();
      expect(order["batchAllocations"]).toBeUndefined();
      expect(order["rawPayload"]).toBeUndefined();
      expect(order["paymentUrl"]).toBeNull();
      expect(order["referenceCode"]).toBeUndefined();
      expect(order["verifiedBy"]).toBeUndefined();
      expect(order["costPrice"]).toBeUndefined();
      expect(list[0]!.paymentMethod).toBe(PaymentMethod.SUBSCRIPTION);
      expect(list[0]!.items).toHaveLength(3);
      expect(list[0]!.items[0]?.productImageUrl).toBe(productWithImageUrl);
      expect(list[0]!.items[0]?.lineTotalVnd).toBe(60_000);
    });

    // Invariant: INV-ORD-9
    it("rejects unauthenticated, guest, staff, and suspended customer callers", async () => {
      await request(app.getHttpServer()).get("/api/v1/orders/me").expect(401);

      for (const header of [
        guestHeader,
        salesHeader,
        adminHeader,
        farmStaffHeader,
        superAdminHeader,
      ]) {
        await request(app.getHttpServer())
          .get("/api/v1/orders/me")
          .set(header)
          .expect(403);
      }

      await setup.db
        .update(users)
        .set({ status: UserStatus.SUSPENDED })
        .where(eq(users.id, customerId));

      const suspendedRes = await request(app.getHttpServer())
        .get("/api/v1/orders/me")
        .set(customerHeader)
        .expect(403);
      expect((suspendedRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED,
      );

      await setup.db
        .update(users)
        .set({ status: UserStatus.ACTIVE, deletedAt: new Date() })
        .where(eq(users.id, customerId));

      const deletedRes = await request(app.getHttpServer())
        .get("/api/v1/orders/me")
        .set(customerHeader)
        .expect(401);
      expect((deletedRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
      );
    });
  });

  describe("GET /api/v1/orders/:id", () => {
    // Invariant: INV-ORD-8, INV-ORD-10
    it("returns full order details with line items, thumbnails, and totals for the owning customer", async () => {
      const orderId = await seedOrder({
        customerId,
        orderCode: "ORD-20261121-DETAIL1",
        orderStatus: OrderStatus.DELIVERED,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PAID,
        subtotal: 170_000,
        discountAmount: 20_000,
        loyaltyPointsUsed: 20_000,
        shippingFee: 25_000,
        totalAmount: 175_000,
        withInternalRecords: true,
        items: [
          {
            productId: productWithImageId,
            quantity: "3.00",
            unitPrice: 40_000,
          },
          {
            productId: productWithoutImageId,
            quantity: "1.00",
            unitPrice: 50_000,
          },
        ],
      });

      await setup.db
        .update(products)
        .set({ deletedAt: new Date(), isActive: false })
        .where(eq(products.id, productWithoutImageId));

      const res = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set(customerHeader)
        .expect(200);

      const order = (res.body as ApiResponse<OrderResponse>).data;
      const rawRecord = order as unknown as Record<string, unknown>;

      expect(order.id).toBe(orderId);
      expect(order.orderCode).toBe("ORD-20261121-DETAIL1");
      expect(order.subtotalVnd).toBe(170_000);
      expect(order.discountAmountVnd).toBe(20_000);
      expect(order.loyaltyPointsUsed).toBe(20_000);
      expect(order.shippingFeeVnd).toBe(25_000);
      expect(order.totalAmountVnd).toBe(175_000);
      expect(order.items).toHaveLength(2);
      expect(order.items[0]?.productImageUrl).toBe(productWithImageUrl);
      expect(order.items[0]?.lineTotalVnd).toBe(120_000);
      expect(order.items[1]?.productName).toBe("Bí đỏ hồ lô");
      expect(order.items[1]?.productImageUrl).toBeNull();
      expect(order.items[1]?.lineTotalVnd).toBe(50_000);

      expect(rawRecord["customerId"]).toBeUndefined();
      expect(rawRecord["subscriptionId"]).toBeUndefined();
      expect(rawRecord["batchAllocations"]).toBeUndefined();
      expect(rawRecord["rawPayload"]).toBeUndefined();
      expect(rawRecord["paymentUrl"]).toBeNull();
      expect(rawRecord["referenceCode"]).toBeUndefined();
      expect(rawRecord["verifiedBy"]).toBeUndefined();
    });

    // Invariant: INV-ORD-7
    it("returns not found for missing UUIDv7 and for orders belonging to another customer", async () => {
      const otherOrderId = await seedOrder({
        customerId: otherCustomerId,
        orderCode: "ORD-20261121-OTHER99",
        items: [
          {
            productId: productWithImageId,
            quantity: "4.00",
            unitPrice: 40_000,
          },
        ],
      });

      const foreignRes = await request(app.getHttpServer())
        .get(`/api/v1/orders/${otherOrderId}`)
        .set(customerHeader)
        .expect(404);
      expect((foreignRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.ORDER_NOT_FOUND,
      );

      const missingRes = await request(app.getHttpServer())
        .get("/api/v1/orders/019fa8bc-8f4d-7000-b366-e691f45cfb99")
        .set(customerHeader)
        .expect(404);
      expect((missingRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.ORDER_NOT_FOUND,
      );

      // Verify owner can still read their own order
      await request(app.getHttpServer())
        .get(`/api/v1/orders/${otherOrderId}`)
        .set(otherCustomerHeader)
        .expect(200);
    });

    it("rejects non-UUIDv7 order identifiers", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/orders/ORD-20261121-ABC123")
        .set(customerHeader)
        .expect(400);
      expect((res.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.VALIDATION_FAILED,
      );
    });

    // Invariant: INV-ORD-9
    it("rejects unauthenticated, guest, staff, and suspended customer requests", async () => {
      const orderId = await seedOrder({
        customerId,
        orderCode: "ORD-20261121-RBAC01",
        items: [
          {
            productId: productWithImageId,
            quantity: "4.00",
            unitPrice: 40_000,
          },
        ],
      });

      await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .expect(401);

      for (const header of [
        guestHeader,
        salesHeader,
        adminHeader,
        farmStaffHeader,
        superAdminHeader,
      ]) {
        await request(app.getHttpServer())
          .get(`/api/v1/orders/${orderId}`)
          .set(header)
          .expect(403);
      }

      await setup.db
        .update(users)
        .set({ status: UserStatus.SUSPENDED })
        .where(eq(users.id, customerId));

      const suspendedRes = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set(customerHeader)
        .expect(403);
      expect((suspendedRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED,
      );

      await setup.db
        .update(users)
        .set({ status: UserStatus.ACTIVE, deletedAt: new Date() })
        .where(eq(users.id, customerId));

      const deletedRes = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set(customerHeader)
        .expect(401);
      expect((deletedRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
      );
    });
  });
});
