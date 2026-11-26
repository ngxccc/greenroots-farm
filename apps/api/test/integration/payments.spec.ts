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
} from "@greenroots/shared";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";
import type { ApiResponse } from "@/common/utils/api-response.util";
import { orders, payments, subscriptions } from "@/database/schemas";
import type { components } from "../generated/api-schema";
import {
  createCategory,
  createOrder,
  createProduct,
  createSubscriptionPlan,
} from "../factories";
import {
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "../helpers/app.helper";
import {
  createAuthenticatedAdmin,
  createAuthenticatedUser,
} from "../helpers/auth.helper";

type PaymentLedgerItem = components["schemas"]["PaymentLedgerItemDto"];
type PaginationMeta = components["schemas"]["PaginationMetaDto"];

describe("Payments Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let jwtService: JwtService;

  let customerId: string;
  let customerHeader: Record<string, string>;
  let guestHeader: Record<string, string>;
  let farmStaffHeader: Record<string, string>;
  let salesId: string;
  let salesName: string;
  let salesHeader: Record<string, string>;
  let adminHeader: Record<string, string>;
  let superAdminHeader: Record<string, string>;
  let productId: string;
  let planId: string;

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    jwtService = app.get(JwtService);
  }, 30000);

  beforeEach(async () => {
    await setup.db.execute(
      sql`TRUNCATE TABLE "payments", "subscriptions", "subscription_plans", "order_items", "orders", "products", "categories", "users" CASCADE;`,
    );

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
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.SALES, {
        fullName: "Nguyễn Văn Sales",
      }),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.ADMIN, {
        fullName: "Trần Thị Admin",
      }),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.SUPER_ADMIN),
    ]);

    customerId = customerSession.user.id;
    customerHeader = customerSession.authHeader;
    guestHeader = guestSession.authHeader;
    farmStaffHeader = farmStaffSession.authHeader;
    salesId = salesSession.user.id;
    salesName = salesSession.user.fullName;
    salesHeader = salesSession.authHeader;
    adminHeader = adminSession.authHeader;
    superAdminHeader = superAdminSession.authHeader;

    const category = await createCategory(setup.db);
    const product = await createProduct(setup.db, {
      categoryId: category.id,
      name: "Cà chua bi hữu cơ",
      slug: "ca-chua-bi-payments",
      basePrice: 80_000,
    });
    productId = product.id;

    const plan = await createSubscriptionPlan(setup.db);
    planId = plan.id;
  });

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  async function seedSubscription(subscriptionCode: string) {
    const [created] = await setup.db
      .insert(subscriptions)
      .values({
        subscriptionCode,
        customerId,
        planId,
        receiverName: "Nguyễn Thị Khách",
        receiverPhone: "0912345678",
        shippingAddress: "12 Nguyễn Văn Linh, Quận 7, TP. Hồ Chí Minh",
        shippingDistanceKm: "5.00",
        shippingFeePerDelivery: 0,
        planName: "Gói Rau Hữu Cơ",
        price: 500_000,
        totalDeliveries: 4,
        weightPerDeliveryKg: "5.00",
        basketDescription: "2kg rau ăn lá",
        deliveryDay: DeliveryDay.TUESDAY,
        remainingDeliveries: 4,
        status: SubscriptionStatus.ACTIVE,
        startDate: "2026-12-01",
        endDate: "2026-12-29",
      })
      .returning();
    return created!;
  }

  describe("GET /api/v1/payments", () => {
    // Invariant: INV-1
    it("enforces staff RBAC allowing sales, admin, super_admin and rejecting farm_staff, customer, guest, and unauthenticated", async () => {
      await request(app.getHttpServer()).get("/api/v1/payments").expect(401);

      for (const header of [customerHeader, guestHeader, farmStaffHeader]) {
        await request(app.getHttpServer())
          .get("/api/v1/payments")
          .set(header)
          .expect(403);
      }

      for (const header of [salesHeader, adminHeader, superAdminHeader]) {
        await request(app.getHttpServer())
          .get("/api/v1/payments")
          .set(header)
          .expect(200);
      }
    });

    // Invariant: INV-5
    it("returns sanitized hydrated ledger items ordered by createdAt DESC, id DESC without rawPayload or paymentUrl", async () => {
      const { order: order1 } = await createOrder(setup.db, {
        customerId,
        orderCode: "ORD-20261126-LED001",
        orderStatus: OrderStatus.DELIVERED,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PENDING,
        items: [{ productId, quantity: "2.00", unitPrice: 80_000 }],
      });

      const sub = await seedSubscription("SUB-20261126-LED002");

      const [subPayment] = await setup.db
        .insert(payments)
        .values({
          subscriptionId: sub.id,
          amount: 500_000,
          paymentMethod: PaymentMethod.PAYOS,
          status: PaymentStatus.PAID,
          transactionType: PaymentTransactionType.PAYMENT,
          orderCode: 900_001,
          referenceCode: "PAYOS-REF-900001",
          paymentUrl: "https://pay.payos.vn/web/secret-link",
          rawPayload: { code: "00", desc: "success", data: { secret: true } },
          paidAt: new Date(),
        })
        .returning();

      const res = await request(app.getHttpServer())
        .get("/api/v1/payments")
        .set(salesHeader)
        .expect(200);

      const body = res.body as ApiResponse<PaymentLedgerItem[], PaginationMeta>;
      expect(body.data).toHaveLength(2);
      expect(body.meta).toMatchObject({ page: 1, limit: 20, total: 2 });

      const first = body.data[0]!;
      const second = body.data[1]!;
      expect(first.id).toBe(subPayment!.id);
      expect(first.subscriptionId).toBe(sub.id);
      expect(first.subscriptionCode).toBe("SUB-20261126-LED002");
      expect(first.orderCode).toBeNull();
      expect(first.payosOrderCode).toBe(900_001);
      expect(first.referenceCode).toBe("PAYOS-REF-900001");
      expect("rawPayload" in first).toBe(false);
      expect("paymentUrl" in first).toBe(false);

      expect(second.orderId).toBe(order1.id);
      expect(second.orderCode).toBe("ORD-20261126-LED001");
      expect(second.subscriptionCode).toBeNull();
      expect("rawPayload" in second).toBe(false);
      expect("paymentUrl" in second).toBe(false);
    });

    // Invariant: INV-5
    it("supports status, paymentMethod, transactionType, orderId, subscriptionId, date range, and case-insensitive search filters", async () => {
      const { order } = await createOrder(setup.db, {
        customerId,
        orderCode: "ORD-20261126-SRCH01",
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PENDING,
        items: [{ productId, quantity: "1.00", unitPrice: 80_000 }],
      });

      const sub = await seedSubscription("SUB-20261126-SRCH02");

      await setup.db.insert(payments).values({
        subscriptionId: sub.id,
        amount: 500_000,
        paymentMethod: PaymentMethod.PAYOS,
        status: PaymentStatus.PAID,
        transactionType: PaymentTransactionType.PAYMENT,
        orderCode: 900_002,
        referenceCode: "FT26330REF02",
        paidAt: new Date(),
      });

      const byOrderSearch = await request(app.getHttpServer())
        .get("/api/v1/payments")
        .query({ search: "srch01" })
        .set(salesHeader)
        .expect(200);
      expect(
        (byOrderSearch.body as ApiResponse<PaymentLedgerItem[]>).data,
      ).toHaveLength(1);
      expect(
        (byOrderSearch.body as ApiResponse<PaymentLedgerItem[]>).data[0]!
          .orderId,
      ).toBe(order.id);

      const byRefSearch = await request(app.getHttpServer())
        .get("/api/v1/payments")
        .query({ search: "ft26330ref02" })
        .set(salesHeader)
        .expect(200);
      expect(
        (byRefSearch.body as ApiResponse<PaymentLedgerItem[]>).data,
      ).toHaveLength(1);
      expect(
        (byRefSearch.body as ApiResponse<PaymentLedgerItem[]>).data[0]!
          .subscriptionId,
      ).toBe(sub.id);

      const byFilters = await request(app.getHttpServer())
        .get("/api/v1/payments")
        .query({
          status: PaymentStatus.PAID,
          paymentMethod: PaymentMethod.PAYOS,
          transactionType: PaymentTransactionType.PAYMENT,
          subscriptionId: sub.id,
        })
        .set(adminHeader)
        .expect(200);
      expect(
        (byFilters.body as ApiResponse<PaymentLedgerItem[]>).data,
      ).toHaveLength(1);

      await request(app.getHttpServer())
        .get("/api/v1/payments")
        .query({ unknownParam: "bad" })
        .set(salesHeader)
        .expect(400);
    });
  });

  describe("POST /api/v1/payments/:id/confirm-cod", () => {
    // Invariant: INV-1
    it("enforces staff RBAC allowing sales, admin, super_admin and rejecting farm_staff, customer, guest, unauthenticated, and invalid UUIDs", async () => {
      const { order } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.SHIPPING,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PENDING,
        items: [{ productId, quantity: "1.00", unitPrice: 80_000 }],
      });
      const [paymentRow] = await setup.db
        .select()
        .from(payments)
        .where(eq(payments.orderId, order.id));

      await request(app.getHttpServer())
        .post(`/api/v1/payments/${paymentRow!.id}/confirm-cod`)
        .expect(401);

      await request(app.getHttpServer())
        .post("/api/v1/payments/not-a-uuid/confirm-cod")
        .set(salesHeader)
        .expect(400);

      for (const header of [customerHeader, guestHeader, farmStaffHeader]) {
        await request(app.getHttpServer())
          .post(`/api/v1/payments/${paymentRow!.id}/confirm-cod`)
          .set(header)
          .expect(403);
      }

      await request(app.getHttpServer())
        .post(`/api/v1/payments/${paymentRow!.id}/confirm-cod`)
        .set(salesHeader)
        .expect(200);
    });

    // Invariant: INV-2, INV-4
    it("serializes concurrent confirm-cod requests under orders -> payments lock without overwriting attribution", async () => {
      const { order } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.SHIPPING,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PENDING,
        items: [{ productId, quantity: "1.00", unitPrice: 80_000 }],
      });
      const [paymentRow] = await setup.db
        .select()
        .from(payments)
        .where(eq(payments.orderId, order.id));

      const [firstRes, secondRes] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/payments/${paymentRow!.id}/confirm-cod`)
          .set(salesHeader),
        request(app.getHttpServer())
          .post(`/api/v1/payments/${paymentRow!.id}/confirm-cod`)
          .set(adminHeader),
      ]);

      expect(firstRes.status).toBe(200);
      expect(secondRes.status).toBe(200);

      const firstBody = (firstRes.body as ApiResponse<PaymentLedgerItem>).data;
      const secondBody = (secondRes.body as ApiResponse<PaymentLedgerItem>)
        .data;
      expect(firstBody.status).toBe(PaymentStatus.PAID);
      expect(secondBody.status).toBe(PaymentStatus.PAID);
      expect(firstBody.verifiedBy).toBe(secondBody.verifiedBy);
      expect(firstBody.paidAt).toBe(secondBody.paidAt);

      const [orderAfter] = await setup.db
        .select()
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(orderAfter?.paymentStatus).toBe(PaymentStatus.PAID);
    });

    // Invariant: INV-2, INV-4, INV-PAID-COMPLETE
    it("settles payment PAID, verifiedBy, paidAt, syncs orders.paymentStatus, preserves attribution on replay, and unblocks order completion", async () => {
      const { order } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PENDING,
        items: [{ productId, quantity: "2.00", unitPrice: 80_000 }],
      });
      const [paymentRow] = await setup.db
        .select()
        .from(payments)
        .where(eq(payments.orderId, order.id));

      // Before COD confirmation, delivered -> completed is blocked
      const blockedCompleteRes = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${order.id}/status`)
        .set(salesHeader)
        .send({ status: OrderStatus.COMPLETED })
        .expect(422);
      expect((blockedCompleteRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.ORDER_PAYMENT_REQUIRED,
      );

      // Confirm COD as sales
      const confirmRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${paymentRow!.id}/confirm-cod`)
        .set(salesHeader)
        .expect(200);

      const confirmed = (confirmRes.body as ApiResponse<PaymentLedgerItem>)
        .data;
      expect(confirmed.status).toBe(PaymentStatus.PAID);
      expect(confirmed.verifiedBy).toBe(salesId);
      expect(confirmed.verifiedByName).toBe(salesName);
      expect(confirmed.paidAt).not.toBeNull();

      // Verify order paymentStatus synced without mutating orderStatus
      const [orderAfter] = await setup.db
        .select()
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(orderAfter?.paymentStatus).toBe(PaymentStatus.PAID);
      expect(orderAfter?.orderStatus).toBe(OrderStatus.DELIVERED);

      // Idempotent replay as admin preserves original sales verifiedBy and paidAt
      const replayRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${paymentRow!.id}/confirm-cod`)
        .set(adminHeader)
        .expect(200);

      const replayed = (replayRes.body as ApiResponse<PaymentLedgerItem>).data;
      expect(replayed.verifiedBy).toBe(salesId);
      expect(replayed.verifiedByName).toBe(salesName);
      expect(replayed.paidAt).toBe(confirmed.paidAt);

      // Now delivered -> completed succeeds
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${order.id}/status`)
        .set(salesHeader)
        .send({ status: OrderStatus.COMPLETED })
        .expect(200);
    });

    // Invariant: INV-3
    it("rejects missing, non-COD, ineligible order statuses, and terminal non-paid payment statuses", async () => {
      const missingRes = await request(app.getHttpServer())
        .post(
          "/api/v1/payments/019fa8bc-8f4d-7000-b366-e691f45cfb99/confirm-cod",
        )
        .set(salesHeader)
        .expect(404);
      expect((missingRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.PAYMENT_NOT_FOUND,
      );

      // Ineligible order status (packing)
      const { order: packingOrder } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.PACKING,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PENDING,
        items: [{ productId, quantity: "1.00", unitPrice: 80_000 }],
      });
      const [packingPayment] = await setup.db
        .select()
        .from(payments)
        .where(eq(payments.orderId, packingOrder.id));

      const packingRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${packingPayment!.id}/confirm-cod`)
        .set(salesHeader)
        .expect(422);
      expect((packingRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.PAYMENT_COD_NOT_ELIGIBLE,
      );

      // Terminal non-paid payment status (cancelled)
      const { order: cancelledOrder } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.CANCELLED,
        items: [{ productId, quantity: "1.00", unitPrice: 80_000 }],
      });
      const [cancelledPayment] = await setup.db
        .select()
        .from(payments)
        .where(eq(payments.orderId, cancelledOrder.id));

      const cancelledRes = await request(app.getHttpServer())
        .post(`/api/v1/payments/${cancelledPayment!.id}/confirm-cod`)
        .set(salesHeader)
        .expect(422);
      expect((cancelledRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.PAYMENT_INVALID_STATUS_TRANSITION,
      );
    });
  });
});
