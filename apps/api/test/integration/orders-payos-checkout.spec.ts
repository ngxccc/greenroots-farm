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
import { and, eq, isNull, sql } from "drizzle-orm";
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
  batchAllocations,
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
import { OrdersService } from "@/modules/orders/orders.service";
import { MockPaymentDriver } from "@/modules/payments/drivers/mock-payment.driver";
import { PAYMENT_DRIVER_TOKEN } from "@/modules/payments/payments.constant";
import {
  BatchMother,
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
import { createAuthenticatedUser } from "../helpers/auth.helper";

type OrderResponse = components["schemas"]["OrderDto"];
type PayosWebhookResponse = components["schemas"]["PayosWebhookResponseDto"];

const QUAN_1 = HCMC_DISTRICTS.find((d) => d.code === "quan-1")!;

describe("Orders Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let jwtService: JwtService;
  let appRedisClient: ReturnType<RedisService["getClient"]>;
  let mockPaymentDriver: MockPaymentDriver;

  let customerId: string;
  let customerHeader: { Authorization: string };

  let farmId: string;
  let seasonId: string;
  let categoryId: string;
  let regularProductId: string;
  let deliverableAddressId: string;

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    jwtService = app.get(JwtService);
    appRedisClient = app.get(RedisService).getClient();
    mockPaymentDriver = app.get<MockPaymentDriver>(PAYMENT_DRIVER_TOKEN);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  beforeEach(async () => {
    await setup.db.execute(
      sql`TRUNCATE TABLE "payments", "batch_allocations", "order_items", "orders", "batches", "products", "categories", "seasons", "plots", "farms", "user_addresses", "users" CASCADE;`,
    );
    await cleanScopedRedisKeys(setup.redisClient);
    await appRedisClient
      .unlink(FARM_SETTINGS_CACHE_KEY, FARM_SETTINGS_INVALIDATED_AT_KEY)
      .catch(() => undefined);
    mockPaymentDriver.clear();

    const customer = await createAuthenticatedUser(setup.db, jwtService, {
      email: "payos.customer@greenroots.farm",
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      rewardPoints: 50_000,
    });
    customerId = customer.user.id;
    customerHeader = customer.authHeader;

    const farm = await createFarm(setup.db, {
      isPayosEnabled: true,
      isCodEnabled: true,
    });
    farmId = farm.id;

    const plot = await createPlot(setup.db, { farmId });
    const season = await createSeason(setup.db, { plotId: plot.id });
    seasonId = season.id;

    const category = await createCategory(setup.db, { isActive: true });
    categoryId = category.id;

    const regular = await createProduct(setup.db, {
      categoryId,
      name: "Bắp cải hữu cơ",
      slug: "bap-cai-huu-co",
      basePrice: 80_000,
      salePrice: null,
      unit: "kg",
      isActive: true,
    });
    regularProductId = regular.id;

    await createBatch(
      setup.db,
      BatchMother.inStock({
        productId: regularProductId,
        seasonId,
        initialQuantity: "20.00",
        availableQuantity: "20.00",
        expirationDate: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      }),
    );

    const [addr] = await setup.db
      .insert(userAddresses)
      .values({
        userId: customerId,
        receiverName: "Tran Thi Binh",
        phoneNumber: "0909123456",
        streetAddress: "123 Le Loi",
        district: QUAN_1.name,
        districtCode: QUAN_1.code,
        city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
        latitude: QUAN_1.latitude.toFixed(8),
        longitude: QUAN_1.longitude.toFixed(8),
        isDefault: true,
      })
      .returning();
    deliverableAddressId = addr!.id;
  });

  describe("POST /api/v1/orders/checkout", () => {
    // Invariants: INV-PAY-CHK-1, INV-PAY-CHK-3
    it("creates pending_payment order with FEFO allocation, paymentUrl, and 15-minute reservation expiry", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          items: [{ productId: regularProductId, quantity: 2 }],
          addressId: deliverableAddressId,
          loyaltyPoints: 10_000,
          paymentMethod: PaymentMethod.PAYOS,
        })
        .expect(201);

      const body = response.body as ApiResponse<OrderResponse>;
      expect(body.success).toBe(true);
      expect(body.data.orderStatus).toBe(OrderStatus.PENDING_PAYMENT);
      expect(body.data.paymentMethod).toBe(PaymentMethod.PAYOS);
      expect(body.data.paymentStatus).toBe(PaymentStatus.PENDING);
      expect(body.data.subtotalVnd).toBe(160_000);
      expect(body.data.loyaltyPointsUsed).toBe(10_000);
      expect(body.data.totalAmountVnd).toBe(
        160_000 - 10_000 + body.data.shippingFeeVnd,
      );
      expect(body.data.paymentUrl).toContain(
        "https://mock.payos.local/checkout/",
      );
      expect(body.data.reservationExpiresAt).toBeTruthy();

      const [paymentRow] = await setup.db
        .select()
        .from(payments)
        .where(eq(payments.orderId, body.data.id));
      expect(paymentRow).toBeDefined();
      expect(paymentRow!.paymentMethod).toBe(PaymentMethod.PAYOS);
      expect(paymentRow!.status).toBe(PaymentStatus.PENDING);
      expect(paymentRow!.orderCode).toBeGreaterThan(0);
      expect(paymentRow!.paymentUrl).toBe(body.data.paymentUrl);

      const [batchRow] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.productId, regularProductId));
      expect(Number(batchRow!.availableQuantity)).toBe(18);

      const [detailRes, listRes] = await Promise.all([
        request(app.getHttpServer())
          .get(`/api/v1/orders/${body.data.id}`)
          .set(customerHeader)
          .expect(200),
        request(app.getHttpServer())
          .get("/api/v1/orders/me")
          .set(customerHeader)
          .expect(200),
      ]);

      expect(
        (detailRes.body as ApiResponse<OrderResponse>).data.paymentUrl,
      ).toBe(body.data.paymentUrl);
      expect(
        (listRes.body as ApiResponse<OrderResponse[]>).data[0]!.paymentUrl,
      ).toBe(body.data.paymentUrl);
    });

    // Invariant: INV-PAY-CHK-1
    it("rejects PayOS checkout when PayOS is disabled in farm settings", async () => {
      await setup.db
        .update(farms)
        .set({ isPayosEnabled: false })
        .where(eq(farms.id, farmId));
      await appRedisClient.del(
        FARM_SETTINGS_CACHE_KEY,
        FARM_SETTINGS_INVALIDATED_AT_KEY,
      );

      const response = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          items: [{ productId: regularProductId, quantity: 1 }],
          addressId: deliverableAddressId,
          paymentMethod: PaymentMethod.PAYOS,
        })
        .expect(422);

      expect((response.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.ORDER_PAYOS_DISABLED,
      );
    });

    // Invariant: INV-PAY-CHK-1 (EDGE-1)
    it("rejects PayOS checkout when totalAmountVnd is zero after loyalty redemption", async () => {
      await setup.db
        .update(farms)
        .set({
          shippingConfig: {
            baseFeeVnd: 0,
            freeKmThreshold: 3,
            perKmRateVnd: 5000,
            detourFactor: 1.3,
            maxRadiusKm: 25,
            subscriptionFreeRadiusKm: 20,
          },
        })
        .where(eq(farms.id, farmId));
      await appRedisClient
        .unlink(FARM_SETTINGS_CACHE_KEY, FARM_SETTINGS_INVALIDATED_AT_KEY)
        .catch(() => undefined);

      await setup.db
        .update(users)
        .set({ rewardPoints: 500_000 })
        .where(eq(users.id, customerId));

      // Place address at farm coordinates (distance 0 => shippingFeeVnd = 0)
      const [freeShipAddr] = await setup.db
        .insert(userAddresses)
        .values({
          userId: customerId,
          receiverName: "Free Ship",
          phoneNumber: "0909123457",
          streetAddress: "Hub",
          district: "Bình Thạnh",
          districtCode: "binh-thanh",
          city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
          latitude: BUSINESS_RULES.FULFILLMENT_HUB.LATITUDE.toFixed(8),
          longitude: BUSINESS_RULES.FULFILLMENT_HUB.LONGITUDE.toFixed(8),
          isDefault: false,
        })
        .returning();

      const response = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          items: [{ productId: regularProductId, quantity: 1 }],
          addressId: freeShipAddr!.id,
          loyaltyPoints: 80_000,
          paymentMethod: PaymentMethod.PAYOS,
        })
        .expect(422);

      expect((response.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.ORDER_PAYOS_ZERO_AMOUNT,
      );

      const [userRow] = await setup.db
        .select({ rewardPoints: users.rewardPoints })
        .from(users)
        .where(eq(users.id, customerId));
      expect(userRow!.rewardPoints).toBe(500_000);
    });

    // Invariant: INV-PAY-CHK-1
    it("rejects PayOS checkout when customer has reached the pending PayOS order limit", async () => {
      for (
        let i = 0;
        i < BUSINESS_RULES.MAX_PENDING_PAYOS_ORDERS_PER_CUSTOMER;
        i += 1
      ) {
        await request(app.getHttpServer())
          .post("/api/v1/orders/checkout")
          .set(customerHeader)
          .set("Idempotency-Key", randomUUID())
          .send({
            items: [{ productId: regularProductId, quantity: 1 }],
            addressId: deliverableAddressId,
            paymentMethod: PaymentMethod.PAYOS,
          })
          .expect(201);
      }

      const response = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          items: [{ productId: regularProductId, quantity: 1 }],
          addressId: deliverableAddressId,
          paymentMethod: PaymentMethod.PAYOS,
        })
        .expect(422);

      expect((response.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.ORDER_PAYOS_PENDING_LIMIT_EXCEEDED,
      );
    });

    // Invariant: INV-PAY-CHK-2 (ADV-2)
    it("compensates stock and loyalty points when payment link creation fails", async () => {
      const originalCreateLink =
        mockPaymentDriver.createPaymentLink.bind(mockPaymentDriver);
      mockPaymentDriver.createPaymentLink = () =>
        Promise.reject(new Error("PayOS upstream timeout"));

      try {
        const response = await request(app.getHttpServer())
          .post("/api/v1/orders/checkout")
          .set(customerHeader)
          .set("Idempotency-Key", randomUUID())
          .send({
            items: [{ productId: regularProductId, quantity: 2 }],
            addressId: deliverableAddressId,
            loyaltyPoints: 10_000,
            paymentMethod: PaymentMethod.PAYOS,
          })
          .expect(502);

        expect((response.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.PAYMENT_GATEWAY_ERROR,
        );

        const [batchRow] = await setup.db
          .select()
          .from(batches)
          .where(eq(batches.productId, regularProductId));
        expect(Number(batchRow!.availableQuantity)).toBe(20);
        expect(batchRow!.status).toBe(BatchStatus.IN_STOCK);

        const [userRow] = await setup.db
          .select({ rewardPoints: users.rewardPoints })
          .from(users)
          .where(eq(users.id, customerId));
        expect(userRow!.rewardPoints).toBe(50_000);

        const [orderRow] = await setup.db
          .select()
          .from(orders)
          .where(eq(orders.customerId, customerId));
        expect(orderRow!.orderStatus).toBe(OrderStatus.CANCELLED);
        expect(orderRow!.paymentStatus).toBe(PaymentStatus.FAILED);

        const [paymentRow] = await setup.db
          .select()
          .from(payments)
          .where(eq(payments.orderId, orderRow!.id));
        expect(paymentRow!.status).toBe(PaymentStatus.FAILED);

        const activeAllocations = await setup.db
          .select()
          .from(batchAllocations)
          .innerJoin(
            orderItems,
            eq(batchAllocations.orderItemId, orderItems.id),
          )
          .where(
            and(
              eq(orderItems.orderId, orderRow!.id),
              isNull(batchAllocations.releasedAt),
            ),
          );
        expect(activeAllocations).toHaveLength(0);
      } finally {
        mockPaymentDriver.createPaymentLink = originalCreateLink;
      }
    });

    // Invariant: INV-PAY-CHK-4
    it("releases FEFO allocations when a pending_payment PayOS order is self-cancelled", async () => {
      const checkoutRes = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          items: [{ productId: regularProductId, quantity: 3 }],
          addressId: deliverableAddressId,
          loyaltyPoints: 5_000,
          paymentMethod: PaymentMethod.PAYOS,
        })
        .expect(201);

      const orderId = (checkoutRes.body as ApiResponse<OrderResponse>).data.id;

      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${orderId}/cancel`)
        .set(customerHeader)
        .expect(200);

      expect(
        (cancelRes.body as ApiResponse<OrderResponse>).data.orderStatus,
      ).toBe(OrderStatus.CANCELLED);

      const [batchRow] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.productId, regularProductId));
      expect(Number(batchRow!.availableQuantity)).toBe(20);

      const [userRow] = await setup.db
        .select({ rewardPoints: users.rewardPoints })
        .from(users)
        .where(eq(users.id, customerId));
      expect(userRow!.rewardPoints).toBe(50_000);
    });

    // Invariant: INV-PAY-CHK-1
    it("enforces pending PayOS order limit under concurrent checkouts", async () => {
      const attempts = Array.from(
        { length: BUSINESS_RULES.MAX_PENDING_PAYOS_ORDERS_PER_CUSTOMER + 1 },
        () =>
          request(app.getHttpServer())
            .post("/api/v1/orders/checkout")
            .set(customerHeader)
            .set("Idempotency-Key", randomUUID())
            .send({
              items: [{ productId: regularProductId, quantity: 1 }],
              addressId: deliverableAddressId,
              paymentMethod: PaymentMethod.PAYOS,
            }),
      );

      const responses = await Promise.all(attempts);
      const created = responses.filter((r) => r.status === 201);
      const rejected = responses.filter((r) => r.status === 422);

      expect(created).toHaveLength(
        BUSINESS_RULES.MAX_PENDING_PAYOS_ORDERS_PER_CUSTOMER,
      );
      expect(rejected).toHaveLength(1);
      expect((rejected[0]!.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.ORDER_PAYOS_PENDING_LIMIT_EXCEEDED,
      );
    });
  });

  describe("POST /api/v1/payments/payos/webhook", () => {
    async function createPendingPayosOrder() {
      const checkoutRes = await request(app.getHttpServer())
        .post("/api/v1/orders/checkout")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          items: [{ productId: regularProductId, quantity: 2 }],
          addressId: deliverableAddressId,
          paymentMethod: PaymentMethod.PAYOS,
        })
        .expect(201);

      const order = (checkoutRes.body as ApiResponse<OrderResponse>).data;
      const [paymentRow] = await setup.db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.orderId, order.id),
            eq(payments.transactionType, PaymentTransactionType.PAYMENT),
          ),
        );

      return { order, payment: paymentRow! };
    }

    // Invariants: INV-PAY-CHK-5, INV-PAY-CHK-6
    it("confirms pending_payment order on valid webhook, hides paymentUrl afterward, and handles duplicate replays idempotently", async () => {
      const { order, payment } = await createPendingPayosOrder();

      const webhookPayload = {
        code: "00",
        desc: "success",
        success: true,
        data: {
          orderCode: payment.orderCode!,
          amount: order.totalAmountVnd,
          description: order.orderCode,
          accountNumber: "12345678",
          reference: `REF-${payment.orderCode}`,
          transactionDateTime: "2026-11-26T02:00:00.000Z",
          currency: "VND",
          paymentLinkId: `mock-link-${payment.orderCode}`,
          code: "00",
          desc: "success",
          extraPayosField: "keep-intact",
        },
        signature: "valid-mock-signature",
      };

      const firstRes = await request(app.getHttpServer())
        .post("/api/v1/payments/payos/webhook")
        .send(webhookPayload)
        .expect(200);

      expect(
        (firstRes.body as ApiResponse<PayosWebhookResponse>).data.received,
      ).toBe(true);

      const [updatedOrder] = await setup.db
        .select()
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(updatedOrder!.orderStatus).toBe(OrderStatus.CONFIRMED);
      expect(updatedOrder!.paymentStatus).toBe(PaymentStatus.PAID);
      expect(updatedOrder!.reservationExpiresAt).toBeNull();

      const [updatedPayment] = await setup.db
        .select()
        .from(payments)
        .where(eq(payments.id, payment.id));
      expect(updatedPayment!.status).toBe(PaymentStatus.PAID);
      expect(updatedPayment!.referenceCode).toBe(`REF-${payment.orderCode}`);
      expect(updatedPayment!.paidAt).toBeInstanceOf(Date);
      expect(updatedPayment!.rawPayload).toBeTruthy();

      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/orders/${order.id}`)
        .set(customerHeader)
        .expect(200);
      expect(
        (detailRes.body as ApiResponse<OrderResponse>).data.paymentUrl,
      ).toBeNull();

      // Replay identical webhook
      const replayRes = await request(app.getHttpServer())
        .post("/api/v1/payments/payos/webhook")
        .send(webhookPayload)
        .expect(200);
      expect(
        (replayRes.body as ApiResponse<PayosWebhookResponse>).data.received,
      ).toBe(true);
    });

    // Invariant: INV-PAY-CHK-5 (ADV-4)
    it("rejects invalid webhook signature without mutating order state", async () => {
      const { order, payment } = await createPendingPayosOrder();

      const response = await request(app.getHttpServer())
        .post("/api/v1/payments/payos/webhook")
        .send({
          code: "00",
          desc: "success",
          data: {
            orderCode: payment.orderCode!,
            amount: order.totalAmountVnd,
          },
          signature: "invalid",
        })
        .expect(401);

      expect((response.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.PAYMENT_WEBHOOK_SIGNATURE_INVALID,
      );

      const [unchangedOrder] = await setup.db
        .select()
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(unchangedOrder!.orderStatus).toBe(OrderStatus.PENDING_PAYMENT);
    });

    // Invariant: INV-PAY-CHK-5 (ADV-4)
    it("rejects amount mismatch without mutating order state", async () => {
      const { order, payment } = await createPendingPayosOrder();

      const response = await request(app.getHttpServer())
        .post("/api/v1/payments/payos/webhook")
        .send({
          code: "00",
          desc: "success",
          data: {
            orderCode: payment.orderCode!,
            amount: order.totalAmountVnd - 1_000,
          },
          signature: "valid-mock-signature",
        })
        .expect(422);

      expect((response.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.PAYMENT_AMOUNT_MISMATCH,
      );

      const [unchangedOrder] = await setup.db
        .select()
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(unchangedOrder!.orderStatus).toBe(OrderStatus.PENDING_PAYMENT);
    });

    // Invariant: INV-PAY-CHK-7 (ADV-3)
    it("records payment evidence without resurrecting an order already cancelled by expiry or customer", async () => {
      const { order, payment } = await createPendingPayosOrder();

      // Cancel via expiry sweep
      const ordersService = app.get(OrdersService);
      await ordersService.expireStaleReservations(
        new Date(Date.now() + 20 * 60_000),
      );

      const response = await request(app.getHttpServer())
        .post("/api/v1/payments/payos/webhook")
        .send({
          code: "00",
          desc: "success",
          data: {
            orderCode: payment.orderCode!,
            amount: order.totalAmountVnd,
            reference: `LATE-REF-${payment.orderCode}`,
          },
          signature: "valid-mock-signature",
        })
        .expect(200);

      expect(
        (response.body as ApiResponse<PayosWebhookResponse>).data.received,
      ).toBe(true);

      const [orderAfter] = await setup.db
        .select()
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(orderAfter!.orderStatus).toBe(OrderStatus.CANCELLED);

      const [paymentAfter] = await setup.db
        .select()
        .from(payments)
        .where(eq(payments.id, payment.id));
      expect(paymentAfter!.status).toBe(PaymentStatus.PAID);
      expect(paymentAfter!.referenceCode).toBe(`LATE-REF-${payment.orderCode}`);
      expect(paymentAfter!.paidAt).toBeInstanceOf(Date);

      const [batchRow] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.productId, regularProductId));
      expect(Number(batchRow!.availableQuantity)).toBe(20);
    });

    // Invariant: INV-PAY-CHK-5
    it("rejects missing or empty webhook signature with unauthorized error", async () => {
      const { order, payment } = await createPendingPayosOrder();

      const [missingRes, emptyRes] = await Promise.all([
        request(app.getHttpServer())
          .post("/api/v1/payments/payos/webhook")
          .send({
            code: "00",
            desc: "success",
            data: {
              orderCode: payment.orderCode!,
              amount: order.totalAmountVnd,
            },
          })
          .expect(401),
        request(app.getHttpServer())
          .post("/api/v1/payments/payos/webhook")
          .send({
            code: "00",
            desc: "success",
            data: {
              orderCode: payment.orderCode!,
              amount: order.totalAmountVnd,
            },
            signature: "",
          })
          .expect(401),
      ]);

      expect((missingRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.PAYMENT_WEBHOOK_SIGNATURE_INVALID,
      );
      expect((emptyRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.PAYMENT_WEBHOOK_SIGNATURE_INVALID,
      );
    });

    it("rejects unknown top-level fields on webhook envelope", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/payments/payos/webhook")
        .send({
          code: "00",
          desc: "success",
          data: {},
          signature: "valid-mock-signature",
          unexpectedEnvelopeField: true,
        })
        .expect(400);
    });

    it("acknowledges non-success webhook code without confirming order", async () => {
      const { order, payment } = await createPendingPayosOrder();

      const res = await request(app.getHttpServer())
        .post("/api/v1/payments/payos/webhook")
        .send({
          code: "01",
          desc: "failed",
          success: false,
          data: {
            orderCode: payment.orderCode!,
            amount: order.totalAmountVnd,
            code: "01",
            desc: "failed",
          },
          signature: "valid-mock-signature",
        })
        .expect(200);

      expect(
        (res.body as ApiResponse<PayosWebhookResponse>).data.received,
      ).toBe(true);

      const [unchangedOrder] = await setup.db
        .select()
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(unchangedOrder!.orderStatus).toBe(OrderStatus.PENDING_PAYMENT);
      expect(unchangedOrder!.paymentStatus).toBe(PaymentStatus.PENDING);
    });

    // Invariant: INV-PAY-CHK-6
    it("settles order exactly once under concurrent duplicate webhooks", async () => {
      const { order, payment } = await createPendingPayosOrder();

      const payload = {
        code: "00",
        desc: "success",
        success: true,
        data: {
          orderCode: payment.orderCode!,
          amount: order.totalAmountVnd,
          description: order.orderCode,
          accountNumber: "12345678",
          reference: `CONC-REF-${payment.orderCode}`,
          transactionDateTime: "2026-11-26T02:00:00.000Z",
          currency: "VND",
          paymentLinkId: `mock-link-${payment.orderCode}`,
          code: "00",
          desc: "success",
        },
        signature: "valid-mock-signature",
      };

      const responses = await Promise.all([
        request(app.getHttpServer())
          .post("/api/v1/payments/payos/webhook")
          .send(payload),
        request(app.getHttpServer())
          .post("/api/v1/payments/payos/webhook")
          .send(payload),
        request(app.getHttpServer())
          .post("/api/v1/payments/payos/webhook")
          .send(payload),
      ]);

      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(
          (res.body as ApiResponse<PayosWebhookResponse>).data.received,
        ).toBe(true);
      }

      const [settledOrder] = await setup.db
        .select()
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(settledOrder!.orderStatus).toBe(OrderStatus.CONFIRMED);
      expect(settledOrder!.paymentStatus).toBe(PaymentStatus.PAID);
    });
  });
});
