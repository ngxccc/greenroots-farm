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
import { sql } from "drizzle-orm";
import {
  API_ERROR_CODES,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  UserRole,
  WasteLogStatus,
} from "@greenroots/shared";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";
import type { ApiResponse } from "@/common/utils/api-response.util";
import { wasteLogs } from "@/database/schemas";
import type { components } from "../generated/api-schema";
import {
  createBatch,
  createCategory,
  createOrder,
  createProduct,
  createSeason,
  createUser,
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

type OperationsAnalytics = components["schemas"]["OperationsAnalyticsDto"];

describe("Analytics Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let jwtService: JwtService;

  let customerId: string;
  let customerHeader: Record<string, string>;
  let guestHeader: Record<string, string>;
  let farmStaffId: string;
  let farmStaffHeader: Record<string, string>;
  let salesHeader: Record<string, string>;
  let adminId: string;
  let adminHeader: Record<string, string>;
  let superAdminHeader: Record<string, string>;

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    jwtService = app.get(JwtService);
  }, 30000);

  beforeEach(async () => {
    await setup.db.execute(
      sql`TRUNCATE TABLE "waste_logs", "batches", "seasons", "plots", "farms", "payments", "order_items", "orders", "products", "categories", "users" CASCADE;`,
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
      createAuthenticatedAdmin(setup.db, jwtService, {
        role: UserRole.FARM_STAFF,
      }),
      createAuthenticatedAdmin(setup.db, jwtService, {
        role: UserRole.SALES,
      }),
      createAuthenticatedAdmin(setup.db, jwtService, {
        role: UserRole.ADMIN,
      }),
      createAuthenticatedAdmin(setup.db, jwtService, {
        role: UserRole.SUPER_ADMIN,
      }),
    ]);

    customerId = customerSession.user.id;
    customerHeader = customerSession.authHeader;
    guestHeader = guestSession.authHeader;
    farmStaffId = farmStaffSession.user.id;
    farmStaffHeader = farmStaffSession.authHeader;
    salesHeader = salesSession.authHeader;
    adminId = adminSession.user.id;
    adminHeader = adminSession.authHeader;
    superAdminHeader = superAdminSession.authHeader;
  });

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  describe("GET /api/v1/analytics/operations", () => {
    it("rejects unauthenticated caller", async () => {
      // Invariant: INV-1, ADV-2
      const res = await request(app.getHttpServer()).get(
        "/api/v1/analytics/operations",
      );

      expect(res.status).toBe(401);
    });

    it("forbids non-admin roles from accessing operational analytics", async () => {
      // Invariant: INV-1, ADV-1
      const forbiddenHeaders = [
        salesHeader,
        farmStaffHeader,
        customerHeader,
        guestHeader,
      ];

      for (const header of forbiddenHeaders) {
        const res = await request(app.getHttpServer())
          .get("/api/v1/analytics/operations")
          .set(header);

        expect(res.status).toBe(403);
      }
    });

    it("returns zero-filled empty analytics when window has no orders or batches", async () => {
      // Invariant: INV-5, EDGE-1
      const res = await request(app.getHttpServer())
        .get("/api/v1/analytics/operations")
        .query({
          from: "2026-11-01",
          to: "2026-11-03",
          granularity: "day",
        })
        .set(adminHeader);

      expect(res.status).toBe(200);
      const body = res.body as ApiResponse<OperationsAnalytics>;
      expect(body.success).toBe(true);
      expect(body.data.period).toEqual({
        from: "2026-11-01",
        to: "2026-11-03",
        granularity: "day",
        timezone: "Asia/Ho_Chi_Minh",
      });
      expect(body.data.summary).toEqual({
        grossItemRevenueVnd: 0,
        deliveredOrderCount: 0,
        totalInitialQuantity: 0,
        totalDiscardedQuantity: 0,
        wasteRatio: 0,
      });
      expect(body.data.revenueSeries).toEqual([
        {
          bucket: "2026-11-01",
          grossItemRevenueVnd: 0,
          deliveredOrderCount: 0,
        },
        {
          bucket: "2026-11-02",
          grossItemRevenueVnd: 0,
          deliveredOrderCount: 0,
        },
        {
          bucket: "2026-11-03",
          grossItemRevenueVnd: 0,
          deliveredOrderCount: 0,
        },
      ]);
      expect(body.data.wasteSeries).toEqual([
        {
          bucket: "2026-11-01",
          initialQuantity: 0,
          discardedQuantity: 0,
          wasteRatio: 0,
        },
        {
          bucket: "2026-11-02",
          initialQuantity: 0,
          discardedQuantity: 0,
          wasteRatio: 0,
        },
        {
          bucket: "2026-11-03",
          initialQuantity: 0,
          discardedQuantity: 0,
          wasteRatio: 0,
        },
      ]);
      expect(body.data.topProducts).toEqual([]);
    });

    it("rejects inverted date range, span exceeding 365 days, excessive topLimit, and unknown params", async () => {
      // Invariant: INV-5, EDGE-3
      const invertedRes = await request(app.getHttpServer())
        .get("/api/v1/analytics/operations")
        .query({ from: "2026-11-10", to: "2026-11-01" })
        .set(superAdminHeader);

      expect(invertedRes.status).toBe(400);
      expect((invertedRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.VALIDATION_FAILED,
      );

      const overSpanRes = await request(app.getHttpServer())
        .get("/api/v1/analytics/operations")
        .query({ from: "2025-01-01", to: "2026-01-01" })
        .set(superAdminHeader);

      expect(overSpanRes.status).toBe(400);
      expect((overSpanRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.VALIDATION_FAILED,
      );

      const overLimitRes = await request(app.getHttpServer())
        .get("/api/v1/analytics/operations")
        .query({ from: "2026-11-01", to: "2026-11-05", topLimit: 21 })
        .set(superAdminHeader);

      expect(overLimitRes.status).toBe(400);

      const unknownParamRes = await request(app.getHttpServer())
        .get("/api/v1/analytics/operations")
        .query({ from: "2026-11-01", to: "2026-11-05", cashflow: "true" })
        .set(superAdminHeader);

      expect(unknownParamRes.status).toBe(400);
    });

    it("computes gross item revenue anchored on deliveredAt without leaking cashflow fields", async () => {
      // Invariant: INV-1, INV-2, EDGE-2, EDGE-4
      const category = await createCategory(setup.db);
      const tomato = await createProduct(setup.db, {
        categoryId: category.id,
        name: "Cà chua bi hữu cơ",
        unit: "kg",
        basePrice: 50_000,
      });
      const spinach = await createProduct(setup.db, {
        categoryId: category.id,
        name: "Cải bó xôi",
        unit: "bó",
        basePrice: 30_000,
      });

      // Delivered 2026-11-03 10:00+07:00 (03:00Z) with loyalty discount & shipping fee
      await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        paymentMethod: PaymentMethod.PAYOS,
        paymentStatus: PaymentStatus.PAID,
        loyaltyPointsUsed: 20_000,
        shippingFee: 15_000,
        deliveredAt: new Date("2026-11-03T03:00:00.000Z"),
        items: [
          { productId: tomato.id, quantity: "2.00", unitPrice: 50_000 },
          { productId: spinach.id, quantity: "1.00", unitPrice: 30_000 },
        ],
      });

      // Replacement 0đ order delivered on 2026-11-03 18:00+07:00
      await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.COMPLETED,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PAID,
        shippingFee: 0,
        deliveredAt: new Date("2026-11-03T11:00:00.000Z"),
        items: [{ productId: tomato.id, quantity: "1.00", unitPrice: 0 }],
      });

      // Boundary: 2026-11-01T17:00:00Z is exactly 2026-11-02 00:00:00+07:00
      await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.COMPLETED,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PAID,
        deliveredAt: new Date("2026-11-01T17:00:00.000Z"),
        items: [{ productId: spinach.id, quantity: "2.00", unitPrice: 30_000 }],
      });

      // Non-delivered orders must be excluded
      await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.SHIPPING,
        deliveredAt: null,
        items: [{ productId: tomato.id, quantity: "10.00", unitPrice: 50_000 }],
      });
      await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.CANCELLED,
        deliveredAt: null,
        items: [{ productId: tomato.id, quantity: "5.00", unitPrice: 50_000 }],
      });

      const res = await request(app.getHttpServer())
        .get("/api/v1/analytics/operations")
        .query({
          from: "2026-11-01",
          to: "2026-11-03",
          granularity: "day",
        })
        .set(adminHeader);

      expect(res.status).toBe(200);
      const body = res.body as ApiResponse<OperationsAnalytics>;

      // 2*50_000 + 1*30_000 + 0 + 2*30_000 = 190_000 (ignores shippingFee & loyaltyPointsUsed)
      expect(body.data.summary.grossItemRevenueVnd).toBe(190_000);
      expect(body.data.summary.deliveredOrderCount).toBe(3);

      expect(body.data.revenueSeries).toEqual([
        {
          bucket: "2026-11-01",
          grossItemRevenueVnd: 0,
          deliveredOrderCount: 0,
        },
        {
          bucket: "2026-11-02",
          grossItemRevenueVnd: 60_000,
          deliveredOrderCount: 1,
        },
        {
          bucket: "2026-11-03",
          grossItemRevenueVnd: 130_000,
          deliveredOrderCount: 2,
        },
      ]);

      // Zero cashflow / deduction leakage
      const serialized = JSON.stringify(body.data);
      for (const forbiddenField of [
        "paymentMethod",
        "paidAmount",
        "refundedAmount",
        "netCashflowVnd",
        "shippingFeeVnd",
        "discountAmountVnd",
      ]) {
        expect(serialized).not.toContain(forbiddenField);
      }
    });

    it("computes cohort waste ratio from approved waste logs without fan-out", async () => {
      // Invariant: INV-4, EDGE-6
      const season = await createSeason(setup.db);
      const product = await createProduct(setup.db);

      const batch1 = await createBatch(setup.db, {
        seasonId: season.id,
        productId: product.id,
        harvestDate: new Date("2026-11-02T02:00:00.000Z"), // 09:00+07:00
        expirationDate: new Date("2026-11-09T02:00:00.000Z"),
        initialQuantity: "100.00",
        availableQuantity: "70.00",
      });

      const batch2 = await createBatch(setup.db, {
        seasonId: season.id,
        productId: product.id,
        harvestDate: new Date("2026-11-02T04:00:00.000Z"), // 11:00+07:00
        expirationDate: new Date("2026-11-09T04:00:00.000Z"),
        initialQuantity: "50.00",
        availableQuantity: "50.00",
      });

      const cloudName = process.env["CLOUDINARY_CLOUD_NAME"] ?? "demo";
      const media = [
        `https://res.cloudinary.com/${cloudName}/image/upload/v1/waste/w1.jpg`,
      ];

      // Two approved logs on batch1 (must sum to 15, without duplicating batch1.initialQuantity)
      await setup.db.insert(wasteLogs).values([
        {
          batchId: batch1.id,
          reportedBy: farmStaffId,
          reviewedBy: adminId,
          discardedQuantity: "10.00",
          reason: "Hư hỏng vận chuyển",
          mediaUrls: media,
          status: WasteLogStatus.APPROVED,
          reviewedAt: new Date("2026-11-04T03:00:00.000Z"),
        },
        {
          batchId: batch1.id,
          reportedBy: farmStaffId,
          reviewedBy: adminId,
          discardedQuantity: "5.00",
          reason: "Dập lá",
          mediaUrls: media,
          status: WasteLogStatus.APPROVED,
          reviewedAt: new Date("2026-11-05T03:00:00.000Z"),
        },
        // Pending and rejected logs must be excluded
        {
          batchId: batch2.id,
          reportedBy: farmStaffId,
          reviewedBy: null,
          discardedQuantity: "20.00",
          reason: "Chờ duyệt",
          mediaUrls: media,
          status: WasteLogStatus.PENDING_APPROVAL,
          reviewedAt: null,
        },
        {
          batchId: batch2.id,
          reportedBy: farmStaffId,
          reviewedBy: adminId,
          discardedQuantity: "10.00",
          reason: "Từ chối",
          rejectionReason: "Không đủ chứng cứ",
          mediaUrls: media,
          status: WasteLogStatus.REJECTED,
          reviewedAt: new Date("2026-11-03T03:00:00.000Z"),
        },
      ]);

      const res = await request(app.getHttpServer())
        .get("/api/v1/analytics/operations")
        .query({
          from: "2026-11-01",
          to: "2026-11-02",
          granularity: "day",
        })
        .set(superAdminHeader);

      expect(res.status).toBe(200);
      const body = res.body as ApiResponse<OperationsAnalytics>;

      // Total initial = 150, approved discarded = 15 => 15 / 150 = 0.1
      expect(body.data.summary.totalInitialQuantity).toBe(150);
      expect(body.data.summary.totalDiscardedQuantity).toBe(15);
      expect(body.data.summary.wasteRatio).toBe(0.1);
      expect(body.data.wasteSeries).toEqual([
        {
          bucket: "2026-11-01",
          initialQuantity: 0,
          discardedQuantity: 0,
          wasteRatio: 0,
        },
        {
          bucket: "2026-11-02",
          initialQuantity: 150,
          discardedQuantity: 15,
          wasteRatio: 0.1,
        },
      ]);
    });

    it("ranks topProducts by grossItemRevenueVnd and retains soft-deleted products", async () => {
      // Invariant: INV-2, EDGE-5
      const category = await createCategory(setup.db);
      const deletedTopProduct = await createProduct(setup.db, {
        categoryId: category.id,
        name: "Dâu tây Đà Lạt (ngừng bán)",
        unit: "hộp",
        basePrice: 120_000,
        deletedAt: new Date("2026-11-10T00:00:00.000Z"),
      });
      const secondProduct = await createProduct(setup.db, {
        categoryId: category.id,
        name: "Xà lách thủy canh",
        unit: "kg",
        basePrice: 40_000,
      });
      const thirdProduct = await createProduct(setup.db, {
        categoryId: category.id,
        name: "Rau muống",
        unit: "bó",
        basePrice: 15_000,
      });

      await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date("2026-11-05T05:00:00.000Z"),
        items: [
          {
            productId: deletedTopProduct.id,
            quantity: "2.00",
            unitPrice: 120_000,
          },
          {
            productId: secondProduct.id,
            quantity: "3.00",
            unitPrice: 40_000,
          },
          {
            productId: thirdProduct.id,
            quantity: "5.00",
            unitPrice: 15_000,
          },
        ],
      });

      const res = await request(app.getHttpServer())
        .get("/api/v1/analytics/operations")
        .query({
          from: "2026-11-05",
          to: "2026-11-05",
          topLimit: 2,
        })
        .set(adminHeader);

      expect(res.status).toBe(200);
      const body = res.body as ApiResponse<OperationsAnalytics>;

      expect(body.data.topProducts).toEqual([
        {
          productId: deletedTopProduct.id,
          productName: "Dâu tây Đà Lạt (ngừng bán)",
          unit: "hộp",
          totalQuantity: 2,
          grossItemRevenueVnd: 240_000,
        },
        {
          productId: secondProduct.id,
          productName: "Xà lách thủy canh",
          unit: "kg",
          totalQuantity: 3,
          grossItemRevenueVnd: 120_000,
        },
      ]);
    });

    it("aggregates revenue and waste across week and month granularities", async () => {
      // Invariant: INV-5
      await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date("2026-11-25T05:00:00.000Z"), // Week of 2026-11-23
        items: [
          {
            productId: (await createProduct(setup.db)).id,
            quantity: "1.00",
            unitPrice: 50_000,
          },
        ],
      });

      const weekRes = await request(app.getHttpServer())
        .get("/api/v1/analytics/operations")
        .query({
          from: "2026-11-18",
          to: "2026-12-02",
          granularity: "week",
        })
        .set(adminHeader);

      expect(weekRes.status).toBe(200);
      const weekBody = weekRes.body as ApiResponse<OperationsAnalytics>;
      expect(weekBody.data.revenueSeries.map((p) => p.bucket)).toEqual([
        "2026-11-16",
        "2026-11-23",
        "2026-11-30",
      ]);
      expect(weekBody.data.revenueSeries[1]?.grossItemRevenueVnd).toBe(50_000);

      const monthRes = await request(app.getHttpServer())
        .get("/api/v1/analytics/operations")
        .query({
          from: "2026-11-01",
          to: "2026-12-15",
          granularity: "month",
        })
        .set(adminHeader);

      expect(monthRes.status).toBe(200);
      const monthBody = monthRes.body as ApiResponse<OperationsAnalytics>;
      expect(monthBody.data.revenueSeries.map((p) => p.bucket)).toEqual([
        "2026-11",
        "2026-12",
      ]);
      expect(monthBody.data.revenueSeries[0]?.grossItemRevenueVnd).toBe(50_000);
    });
  });

  describe("Database Invariants", () => {
    it("rejects inserting a delivered order with null deliveredAt", async () => {
      // Invariant: INV-3
      const user = await createUser(setup.db);
      const product = await createProduct(setup.db);

      let caughtError: unknown;
      try {
        await createOrder(setup.db, {
          customerId: user.id,
          orderStatus: OrderStatus.DELIVERED,
          deliveredAt: null,
          items: [
            { productId: product.id, quantity: "1.00", unitPrice: 10_000 },
          ],
        });
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeDefined();
      const pgCause = (
        caughtError as { cause?: { code?: string; constraint?: string } }
      ).cause;
      expect(pgCause?.code).toBe("23514");
      expect(pgCause?.constraint).toBe("orders_delivered_at_required");
    });
  });
});
