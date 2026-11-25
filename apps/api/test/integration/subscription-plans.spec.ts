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
import { API_ERROR_CODES, UserRole } from "@greenroots/shared";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";
import type { ApiResponse } from "@/common/utils/api-response.util";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";
import { subscriptionPlans } from "@/database/schemas";
import { createSubscriptionPlan } from "../factories";
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

type SubscriptionPlanResponse = components["schemas"]["SubscriptionPlanDto"];

describe("Subscription Plans Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let jwtService: JwtService;

  let adminHeader: { Authorization: string };
  let superAdminHeader: { Authorization: string };
  let staffHeader: { Authorization: string };
  let customerHeader: { Authorization: string };

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    jwtService = app.get(JwtService);
  });

  beforeEach(async () => {
    await setup.db.execute(
      sql`TRUNCATE TABLE "subscription_plans", "users" CASCADE;`,
    );
    await cleanScopedRedisKeys(setup.redisClient);

    const admin = await createAuthenticatedAdmin(
      setup.db,
      jwtService,
      UserRole.ADMIN,
    );
    adminHeader = admin.authHeader;

    const superAdmin = await createAuthenticatedAdmin(
      setup.db,
      jwtService,
      UserRole.SUPER_ADMIN,
    );
    superAdminHeader = superAdmin.authHeader;

    const staff = await createAuthenticatedAdmin(
      setup.db,
      jwtService,
      UserRole.FARM_STAFF,
    );
    staffHeader = staff.authHeader;

    const customer = await createAuthenticatedUser(setup.db, jwtService, {
      email: "sub-plan-customer@greenroots.vn",
    });
    customerHeader = customer.authHeader;
  });

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  describe("GET /api/v1/subscription-plans", () => {
    it("returns only active non-deleted plans ordered deterministically", async () => {
      const expensiveActive = await createSubscriptionPlan(setup.db, {
        name: "Gói Lớn",
        slug: "goi-lon",
        price: 1500000,
        isActive: true,
      });
      const cheapActive = await createSubscriptionPlan(setup.db, {
        name: "Gói Nhỏ",
        slug: "goi-nho",
        price: 800000,
        isActive: true,
      });
      await createSubscriptionPlan(setup.db, {
        name: "Gói Ngừng Bán",
        slug: "goi-ngung-ban",
        price: 900000,
        isActive: false,
      });
      await createSubscriptionPlan(setup.db, {
        name: "Gói Đã Xóa",
        slug: "goi-da-xoa",
        price: 700000,
        isActive: true,
        deletedAt: new Date(),
      });

      const res = await request(app.getHttpServer()).get(
        "/api/v1/subscription-plans",
      );

      expect(res.status).toBe(200);
      const body = res.body as ApiResponse<SubscriptionPlanResponse[]>;
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data.map((p) => p.id)).toEqual([
        cheapActive.id,
        expensiveActive.id,
      ]);
      expect(body.data[0]?.priceVnd).toBe(800000);
      expect(body.data[0]?.weightPerDeliveryKg).toBe(5);
    });
  });

  describe("GET /api/v1/subscription-plans/admin", () => {
    it("returns all non-deleted plans including inactive ones for admin and super admin", async () => {
      const activePlan = await createSubscriptionPlan(setup.db, {
        slug: "active-plan",
        price: 1000000,
        isActive: true,
      });
      const inactivePlan = await createSubscriptionPlan(setup.db, {
        slug: "inactive-plan",
        price: 1200000,
        isActive: false,
      });
      await createSubscriptionPlan(setup.db, {
        slug: "deleted-plan",
        price: 500000,
        isActive: true,
        deletedAt: new Date(),
      });

      const adminRes = await request(app.getHttpServer())
        .get("/api/v1/subscription-plans/admin")
        .set(adminHeader);
      expect(adminRes.status).toBe(200);
      const adminBody = adminRes.body as ApiResponse<
        SubscriptionPlanResponse[]
      >;
      expect(adminBody.data.map((p) => p.id)).toEqual([
        activePlan.id,
        inactivePlan.id,
      ]);
      expect(adminBody.data[1]?.isActive).toBe(false);

      const superRes = await request(app.getHttpServer())
        .get("/api/v1/subscription-plans/admin")
        .set(superAdminHeader);
      expect(superRes.status).toBe(200);
    });

    it("rejects unauthenticated, customer, and staff callers", async () => {
      const unauthRes = await request(app.getHttpServer()).get(
        "/api/v1/subscription-plans/admin",
      );
      expect(unauthRes.status).toBe(401);

      const customerRes = await request(app.getHttpServer())
        .get("/api/v1/subscription-plans/admin")
        .set(customerHeader);
      expect(customerRes.status).toBe(403);

      const staffRes = await request(app.getHttpServer())
        .get("/api/v1/subscription-plans/admin")
        .set(staffHeader);
      expect(staffRes.status).toBe(403);
    });
  });

  describe("POST /api/v1/subscription-plans", () => {
    it("creates a plan and auto-generates kebab-case slug when omitted", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/subscription-plans")
        .set(adminHeader)
        .send({
          name: "Gói Rau Gia Đình 1 Tháng",
          description: "Gói rau hữu cơ định kỳ cho gia đình.",
          priceVnd: 1200000,
          totalDeliveries: 8,
          weightPerDeliveryKg: 4.5,
          basketDescription: "2kg rau ăn lá + 2.5kg rau củ.",
        });

      expect(res.status).toBe(201);
      const body = res.body as ApiResponse<SubscriptionPlanResponse>;
      expect(body.success).toBe(true);
      expect(body.data.slug).toBe("goi-rau-gia-dinh-1-thang");
      expect(body.data.priceVnd).toBe(1200000);
      expect(body.data.totalDeliveries).toBe(8);
      expect(body.data.weightPerDeliveryKg).toBe(4.5);
      expect(body.data.isActive).toBe(true);
    });

    it("rejects duplicate active slug with conflict", async () => {
      await createSubscriptionPlan(setup.db, {
        slug: "goi-tieu-chuan",
      });

      const res = await request(app.getHttpServer())
        .post("/api/v1/subscription-plans")
        .set(superAdminHeader)
        .send({
          name: "Gói Tiêu Chuẩn Mới",
          slug: "goi-tieu-chuan",
          description: "Mô tả",
          priceVnd: 900000,
          totalDeliveries: 4,
          weightPerDeliveryKg: 3,
          basketDescription: "3kg rau",
        });

      expect(res.status).toBe(409);
      const problem = res.body as Rfc9457ProblemDetails;
      expect(problem.code).toBe(
        API_ERROR_CODES.SUBSCRIPTION_PLAN_SLUG_CONFLICT,
      );
    });

    it("allows reusing a slug from a soft-deleted plan", async () => {
      await createSubscriptionPlan(setup.db, {
        slug: "reusable-slug",
        deletedAt: new Date(),
      });

      const res = await request(app.getHttpServer())
        .post("/api/v1/subscription-plans")
        .set(adminHeader)
        .send({
          name: "Gói Tái Sử Dụng",
          slug: "reusable-slug",
          description: "Mô tả",
          priceVnd: 950000,
          totalDeliveries: 4,
          weightPerDeliveryKg: 3.5,
          basketDescription: "3.5kg rau",
        });

      expect(res.status).toBe(201);
      const body = res.body as ApiResponse<SubscriptionPlanResponse>;
      expect(body.data.slug).toBe("reusable-slug");
    });

    it("rejects non-positive price, totalDeliveries, or weightPerDeliveryKg", async () => {
      const zeroPrice = await request(app.getHttpServer())
        .post("/api/v1/subscription-plans")
        .set(adminHeader)
        .send({
          name: "Invalid Price",
          description: "Desc",
          priceVnd: 0,
          totalDeliveries: 4,
          weightPerDeliveryKg: 3,
          basketDescription: "Basket",
        });
      expect(zeroPrice.status).toBe(400);

      const zeroDeliveries = await request(app.getHttpServer())
        .post("/api/v1/subscription-plans")
        .set(adminHeader)
        .send({
          name: "Invalid Deliveries",
          description: "Desc",
          priceVnd: 500000,
          totalDeliveries: 0,
          weightPerDeliveryKg: 3,
          basketDescription: "Basket",
        });
      expect(zeroDeliveries.status).toBe(400);

      const zeroWeight = await request(app.getHttpServer())
        .post("/api/v1/subscription-plans")
        .set(adminHeader)
        .send({
          name: "Invalid Weight",
          description: "Desc",
          priceVnd: 500000,
          totalDeliveries: 4,
          weightPerDeliveryKg: 0,
          basketDescription: "Basket",
        });
      expect(zeroWeight.status).toBe(400);
    });

    it("rejects staff and customer callers", async () => {
      const payload = {
        name: "Gói Test",
        description: "Desc",
        priceVnd: 500000,
        totalDeliveries: 4,
        weightPerDeliveryKg: 3,
        basketDescription: "Basket",
      };

      const staffRes = await request(app.getHttpServer())
        .post("/api/v1/subscription-plans")
        .set(staffHeader)
        .send(payload);
      expect(staffRes.status).toBe(403);

      const customerRes = await request(app.getHttpServer())
        .post("/api/v1/subscription-plans")
        .set(customerHeader)
        .send(payload);
      expect(customerRes.status).toBe(403);
    });
  });

  describe("PATCH /api/v1/subscription-plans/:id", () => {
    it("updates mutable fields and soft-retires a plan via isActive false", async () => {
      const plan = await createSubscriptionPlan(setup.db, {
        name: "Gói Cũ",
        slug: "goi-cu",
        price: 1000000,
        isActive: true,
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/subscription-plans/${plan.id}`)
        .set(adminHeader)
        .send({
          priceVnd: 1100000,
          isActive: false,
        });

      expect(res.status).toBe(200);
      const body = res.body as ApiResponse<SubscriptionPlanResponse>;
      expect(body.data.priceVnd).toBe(1100000);
      expect(body.data.isActive).toBe(false);

      const [persisted] = await setup.db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, plan.id));
      expect(persisted?.price).toBe(1100000);
      expect(persisted?.isActive).toBe(false);
    });

    it("returns not found for missing or soft-deleted plans", async () => {
      const deletedPlan = await createSubscriptionPlan(setup.db, {
        deletedAt: new Date(),
      });

      const missingRes = await request(app.getHttpServer())
        .patch(
          "/api/v1/subscription-plans/019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9f",
        )
        .set(adminHeader)
        .send({ isActive: false });
      expect(missingRes.status).toBe(404);
      expect((missingRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.SUBSCRIPTION_PLAN_NOT_FOUND,
      );

      const deletedRes = await request(app.getHttpServer())
        .patch(`/api/v1/subscription-plans/${deletedPlan.id}`)
        .set(adminHeader)
        .send({ isActive: false });
      expect(deletedRes.status).toBe(404);
      expect((deletedRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.SUBSCRIPTION_PLAN_NOT_FOUND,
      );
    });

    it("rejects colliding active slug with conflict", async () => {
      await createSubscriptionPlan(setup.db, { slug: "taken-slug" });
      const target = await createSubscriptionPlan(setup.db, {
        slug: "target-slug",
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/subscription-plans/${target.id}`)
        .set(adminHeader)
        .send({ slug: "taken-slug" });

      expect(res.status).toBe(409);
      expect((res.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.SUBSCRIPTION_PLAN_SLUG_CONFLICT,
      );
    });

    it("rejects empty body and invalid UUID", async () => {
      const plan = await createSubscriptionPlan(setup.db);

      const emptyRes = await request(app.getHttpServer())
        .patch(`/api/v1/subscription-plans/${plan.id}`)
        .set(adminHeader)
        .send({});
      expect(emptyRes.status).toBe(400);

      const invalidUuidRes = await request(app.getHttpServer())
        .patch("/api/v1/subscription-plans/not-a-uuid")
        .set(adminHeader)
        .send({ isActive: false });
      expect(invalidUuidRes.status).toBe(400);
    });
  });

  describe("Database Check Constraints", () => {
    it("enforces positive price, total_deliveries, and weight_per_delivery_kg at PostgreSQL level", async () => {
      const assertCheckViolation = async (
        overrides: Partial<typeof subscriptionPlans.$inferInsert>,
        expectedConstraint: string,
      ) => {
        try {
          await createSubscriptionPlan(setup.db, overrides);
          expect.unreachable(`Expected 23514 on ${expectedConstraint}`);
        } catch (err) {
          const details = extractDatabaseErrorDetails(err);
          expect(details.code).toBe(PG_ERROR_CODE.CHECK_VIOLATION);
          expect(details.constraint).toBe(expectedConstraint);
        }
      };

      await assertCheckViolation(
        { price: 0 },
        "subscription_plans_price_positive",
      );
      await assertCheckViolation(
        { totalDeliveries: 0 },
        "subscription_plans_total_deliveries_positive",
      );
      await assertCheckViolation(
        { weightPerDeliveryKg: "0.00" },
        "subscription_plans_weight_per_delivery_kg_positive",
      );
    });
  });
});
