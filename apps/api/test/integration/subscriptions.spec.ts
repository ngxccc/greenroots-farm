import { randomUUID } from "node:crypto";
import { v7 as uuidv7 } from "uuid";
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
  BUSINESS_RULES,
  DeliveryDay,
  PaymentStatus,
  SubscriptionStatus,
  UserRole,
  UserStatus,
} from "@greenroots/shared";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";
import type { ApiResponse } from "@/common/utils/api-response.util";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";
import { payments, subscriptions, userAddresses } from "@/database/schemas";
import { PAYMENT_DRIVER_TOKEN } from "@/modules/payments/payments.constant";
import type { PaymentDriver } from "@/modules/payments/payments.interface";
import { createFarm, createSubscriptionPlan } from "../factories";
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

type SubscriptionResponse = components["schemas"]["SubscriptionDto"];
type PaginationMeta = components["schemas"]["PaginationMetaDto"];

describe("Subscriptions Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let jwtService: JwtService;
  let paymentDriver: PaymentDriver;

  let customerId: string;
  let customerHeader: { Authorization: string };
  let otherCustomerHeader: { Authorization: string };
  let adminHeader: { Authorization: string };
  let staffHeader: { Authorization: string };

  let innerDistrictAddressId: string;
  let outerRingAddressId: string;
  let outOfRadiusAddressId: string;

  async function seedFarmSettings() {
    await createFarm(setup.db, {
      latitude: BUSINESS_RULES.FULFILLMENT_HUB.LATITUDE.toFixed(8),
      longitude: BUSINESS_RULES.FULFILLMENT_HUB.LONGITUDE.toFixed(8),
      shippingConfig: {
        baseFeeVnd: BUSINESS_RULES.SHIPPING.BASE_FEE_VND,
        freeKmThreshold: BUSINESS_RULES.SHIPPING.FREE_KM_THRESHOLD,
        perKmRateVnd: BUSINESS_RULES.SHIPPING.PER_KM_RATE_VND,
        detourFactor: BUSINESS_RULES.SHIPPING.DETOUR_FACTOR,
        maxRadiusKm: BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM,
        subscriptionFreeRadiusKm:
          BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM,
      },
      isCodEnabled: true,
      isPayosEnabled: true,
    });
  }

  async function insertAddress(params: {
    userId: string;
    receiverName: string;
    phoneNumber: string;
    streetAddress: string;
    placeId: string;
    ward: string;
    latitude: string;
    longitude: string;
    isDefault: boolean;
  }): Promise<string> {
    const [row] = await setup.db
      .insert(userAddresses)
      .values({
        userId: params.userId,
        receiverName: params.receiverName,
        phoneNumber: params.phoneNumber,
        streetAddress: params.streetAddress,
        placeId: params.placeId,
        ward: params.ward,
        city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
        latitude: params.latitude,
        longitude: params.longitude,
        isDefault: params.isDefault,
      })
      .returning({ id: userAddresses.id });
    return row!.id;
  }

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    jwtService = app.get(JwtService);
    paymentDriver = app.get<PaymentDriver>(PAYMENT_DRIVER_TOKEN);
  });

  beforeEach(async () => {
    await setup.db.execute(
      sql`TRUNCATE TABLE "payments", "subscriptions", "subscription_plans", "user_addresses", "farms", "users" CASCADE;`,
    );
    await cleanScopedRedisKeys(setup.redisClient);

    await seedFarmSettings();

    const customer = await createAuthenticatedUser(setup.db, jwtService);
    customerId = customer.user.id;
    customerHeader = customer.authHeader;

    const other = await createAuthenticatedUser(setup.db, jwtService, {
      email: "other-sub@greenroots.local",
    });
    otherCustomerHeader = other.authHeader;

    const admin = await createAuthenticatedAdmin(
      setup.db,
      jwtService,
      UserRole.ADMIN,
    );
    adminHeader = admin.authHeader;

    const staff = await createAuthenticatedAdmin(
      setup.db,
      jwtService,
      UserRole.FARM_STAFF,
    );
    staffHeader = staff.authHeader;

    innerDistrictAddressId = await insertAddress({
      userId: customerId,
      receiverName: "Trần Thị Khách",
      phoneNumber: "0912345678",
      streetAddress: "123 Lê Lợi",
      placeId: "mock_place_quan_1",
      ward: "Phường Sài Gòn",
      latitude: "10.77560000",
      longitude: "106.70190000",
      isDefault: true,
    });

    // `binh-chanh` is ~24km road distance from Bình Thạnh hub (between 20km and 25km).
    outerRingAddressId = await insertAddress({
      userId: customerId,
      receiverName: "Nguyễn Ngoại Thành",
      phoneNumber: "0987654321",
      streetAddress: "45 Quốc lộ 1A",
      placeId: "mock_place_binh_chanh",
      ward: "Xã Tân Nhựt",
      latitude: "10.68740000",
      longitude: "106.59390000",
      isDefault: false,
    });

    outOfRadiusAddressId = await insertAddress({
      userId: customerId,
      receiverName: "Lê Cần Giờ",
      phoneNumber: "0909998887",
      streetAddress: "1 Duyên Hải",
      placeId: "mock_place_can_gio",
      ward: "Xã Cần Giờ",
      latitude: "10.41140000",
      longitude: "106.95470000",
      isDefault: false,
    });
  });

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  describe("POST /api/v1/subscriptions", () => {
    // Invariant: INV-SUB-1
    it("creates pending_payment subscription with paymentUrl and activates on verified PayOS webhook", async () => {
      const plan = await createSubscriptionPlan(setup.db, {
        price: 1_200_000,
        totalDeliveries: 8,
      });

      const res = await request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          planId: plan.id,
          addressId: innerDistrictAddressId,
          deliveryDay: DeliveryDay.TUESDAY,
        });

      expect(res.status).toBe(201);
      const body = res.body as ApiResponse<SubscriptionResponse>;
      expect(body.data.status).toBe(SubscriptionStatus.PENDING_PAYMENT);
      expect(body.data.subscriptionCode).toMatch(/^SUB-\d{8}-[0-9A-Z]{6}$/);
      expect(body.data.paymentUrl).toBeTruthy();
      expect(body.data.reservationExpiresAt).toBeTruthy();
      expect(body.data.shippingFeePerDeliveryVnd).toBe(0);
      expect(body.data.totalAmountVnd).toBe(1_200_000);
      expect(body.data.receiverName).toBe("Trần Thị Khách");
      expect(body.data.receiverPhone).toBe("0912345678");

      const [paymentRow] = await setup.db
        .select()
        .from(payments)
        .where(eq(payments.subscriptionId, body.data.id));

      expect(paymentRow).toBeDefined();
      expect(paymentRow?.status).toBe(PaymentStatus.PENDING);
      expect(paymentRow?.amount).toBe(1_200_000);
      expect(paymentRow?.orderCode).toBeGreaterThan(0);

      const webhookRes = await request(app.getHttpServer())
        .post("/api/v1/payments/payos/webhook")
        .send({
          code: "00",
          desc: "success",
          success: true,
          data: {
            orderCode: paymentRow!.orderCode,
            amount: paymentRow!.amount,
            description: body.data.subscriptionCode,
            accountNumber: "12345678",
            reference: `FT-${randomUUID().slice(0, 8)}`,
            transactionDateTime: new Date().toISOString(),
            currency: "VND",
            paymentLinkId: "mock-link",
            code: "00",
            desc: "success",
          },
          signature: "valid-mock-signature",
        });

      expect(webhookRes.status).toBe(200);

      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/subscriptions/${body.data.id}`)
        .set(customerHeader);

      expect(detailRes.status).toBe(200);
      const detail = (detailRes.body as ApiResponse<SubscriptionResponse>).data;
      expect(detail.status).toBe(SubscriptionStatus.ACTIVE);
      expect(detail.reservationExpiresAt).toBeNull();
      expect(detail.paymentUrl).toBeNull();
    });

    // Invariant: INV-SUB-2
    it("preserves immutable plan and receiver snapshots after plan mutation and address deletion", async () => {
      const plan = await createSubscriptionPlan(setup.db, {
        name: "Gói Rau Mùa Xuân",
        price: 900_000,
        totalDeliveries: 4,
        weightPerDeliveryKg: "4.50",
        basketDescription: "3kg rau lá + 1.5kg củ",
      });

      const checkoutRes = await request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          planId: plan.id,
          addressId: innerDistrictAddressId,
          deliveryDay: DeliveryDay.FRIDAY,
        });

      expect(checkoutRes.status).toBe(201);
      const created = (checkoutRes.body as ApiResponse<SubscriptionResponse>)
        .data;

      // Mutate plan via admin PATCH
      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/subscription-plans/${plan.id}`)
        .set(adminHeader)
        .send({
          name: "Gói Đã Đổi Tên",
          priceVnd: 1_500_000,
          isActive: false,
        });
      expect(patchRes.status).toBe(200);

      // Hard delete the saved address (`ADR-0018`)
      await setup.db
        .delete(userAddresses)
        .where(eq(userAddresses.id, innerDistrictAddressId));

      const readRes = await request(app.getHttpServer())
        .get(`/api/v1/subscriptions/${created.id}`)
        .set(customerHeader);

      expect(readRes.status).toBe(200);
      const snapshot = (readRes.body as ApiResponse<SubscriptionResponse>).data;
      expect(snapshot.planName).toBe("Gói Rau Mùa Xuân");
      expect(snapshot.priceVnd).toBe(900_000);
      expect(snapshot.weightPerDeliveryKg).toBe(4.5);
      expect(snapshot.basketDescription).toBe("3kg rau lá + 1.5kg củ");
      expect(snapshot.receiverName).toBe("Trần Thị Khách");
      expect(snapshot.receiverPhone).toBe("0912345678");
      expect(snapshot.shippingAddress).toContain("123 Lê Lợi");
    });

    // Invariant: INV-SUB-3
    it("collects upfront shipping fee across all deliveries when address is in outer subscription ring", async () => {
      const plan = await createSubscriptionPlan(setup.db, {
        price: 1_000_000,
        totalDeliveries: 8,
      });

      const res = await request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          planId: plan.id,
          addressId: outerRingAddressId,
          deliveryDay: DeliveryDay.BOTH,
        });

      expect(res.status).toBe(201);
      const created = (res.body as ApiResponse<SubscriptionResponse>).data;
      expect(created.shippingFeePerDeliveryVnd).toBeGreaterThan(0);
      expect(created.totalAmountVnd).toBe(
        1_000_000 + 8 * created.shippingFeePerDeliveryVnd,
      );

      const [paymentRow] = await setup.db
        .select()
        .from(payments)
        .where(eq(payments.subscriptionId, created.id));
      expect(paymentRow?.amount).toBe(created.totalAmountVnd);
    });

    // Invariant: INV-SUB-4
    it("rejects out-of-radius address without inserting subscription rows", async () => {
      const plan = await createSubscriptionPlan(setup.db);

      const res = await request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          planId: plan.id,
          addressId: outOfRadiusAddressId,
          deliveryDay: DeliveryDay.TUESDAY,
        });

      expect(res.status).toBe(422);
      const problem = res.body as Rfc9457ProblemDetails;
      expect(problem.code).toBe(API_ERROR_CODES.OUT_OF_DELIVERY_RADIUS);

      const rows = await setup.db.select().from(subscriptions);
      expect(rows).toHaveLength(0);
    });

    // Invariant: INV-SUB-4
    it("rejects inactive subscription plan without inserting subscription rows", async () => {
      const plan = await createSubscriptionPlan(setup.db, { isActive: false });

      const res = await request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          planId: plan.id,
          addressId: innerDistrictAddressId,
          deliveryDay: DeliveryDay.TUESDAY,
        });

      expect(res.status).toBe(422);
      const problem = res.body as Rfc9457ProblemDetails;
      expect(problem.code).toBe(API_ERROR_CODES.SUBSCRIPTION_PLAN_INACTIVE);
    });

    // Invariant: INV-SUB-5
    it("enforces maximum pending subscriptions under concurrent checkouts and database check constraints", async () => {
      const plan = await createSubscriptionPlan(setup.db);

      const responses = await Promise.all(
        Array.from(
          { length: BUSINESS_RULES.MAX_PENDING_SUBSCRIPTIONS_PER_CUSTOMER + 1 },
          () =>
            request(app.getHttpServer())
              .post("/api/v1/subscriptions")
              .set(customerHeader)
              .set("Idempotency-Key", randomUUID())
              .send({
                planId: plan.id,
                addressId: innerDistrictAddressId,
                deliveryDay: DeliveryDay.TUESDAY,
              }),
        ),
      );

      const statuses = responses.map((r) => r.status).sort((a, b) => a - b);
      expect(statuses).toEqual([201, 201, 201, 422]);
      const rejected = responses.find((r) => r.status === 422);
      expect((rejected?.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.SUBSCRIPTION_PENDING_LIMIT_REACHED,
      );

      // Verify PostgreSQL CHECK constraint rejects remainingDeliveries > totalDeliveries (`ADR-0005`).
      let checkError: unknown;
      try {
        await setup.db.insert(subscriptions).values({
          subscriptionCode: "SUB-20261126-BADCHK",
          customerId,
          planId: plan.id,
          receiverName: "Test",
          receiverPhone: "0900000000",
          shippingAddress: "Test",
          shippingDistanceKm: "5.00",
          shippingFeePerDelivery: 0,
          planName: plan.name,
          price: plan.price,
          totalDeliveries: 4,
          weightPerDeliveryKg: "5.00",
          basketDescription: "Test",
          deliveryDay: DeliveryDay.TUESDAY,
          remainingDeliveries: 5,
          status: SubscriptionStatus.PENDING_PAYMENT,
          startDate: "2026-12-01",
          endDate: "2026-12-22",
        });
      } catch (error) {
        checkError = error;
      }

      expect(extractDatabaseErrorDetails(checkError).code).toBe(
        PG_ERROR_CODE.CHECK_VIOLATION,
      );
    });

    it("replays identical idempotency key and rejects mismatched payload", async () => {
      const plan = await createSubscriptionPlan(setup.db);
      const idempotencyKey = randomUUID();

      const first = await request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .set(customerHeader)
        .set("Idempotency-Key", idempotencyKey)
        .send({
          planId: plan.id,
          addressId: innerDistrictAddressId,
          deliveryDay: DeliveryDay.TUESDAY,
        });
      expect(first.status).toBe(201);

      const replay = await request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .set(customerHeader)
        .set("Idempotency-Key", idempotencyKey)
        .send({
          planId: plan.id,
          addressId: innerDistrictAddressId,
          deliveryDay: DeliveryDay.TUESDAY,
        });
      expect(replay.status).toBe(201);
      expect((replay.body as ApiResponse<SubscriptionResponse>).data.id).toBe(
        (first.body as ApiResponse<SubscriptionResponse>).data.id,
      );

      const mismatch = await request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .set(customerHeader)
        .set("Idempotency-Key", idempotencyKey)
        .send({
          planId: plan.id,
          addressId: innerDistrictAddressId,
          deliveryDay: DeliveryDay.FRIDAY,
        });
      expect(mismatch.status).toBe(422);
    });

    it("cancels subscription and marks payment failed when payment gateway throws", async () => {
      const plan = await createSubscriptionPlan(setup.db);
      const originalCreateLink =
        paymentDriver.createPaymentLink.bind(paymentDriver);
      paymentDriver.createPaymentLink = () =>
        Promise.reject(new Error("Simulated PayOS outage"));

      try {
        const res = await request(app.getHttpServer())
          .post("/api/v1/subscriptions")
          .set(customerHeader)
          .set("Idempotency-Key", randomUUID())
          .send({
            planId: plan.id,
            addressId: innerDistrictAddressId,
            deliveryDay: DeliveryDay.TUESDAY,
          });

        expect(res.status).toBe(502);
        expect((res.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.PAYMENT_GATEWAY_ERROR,
        );

        const [subRow] = await setup.db.select().from(subscriptions);
        expect(subRow?.status).toBe(SubscriptionStatus.CANCELLED);
        expect(subRow?.reservationExpiresAt).toBeNull();

        const [payRow] = await setup.db.select().from(payments);
        expect(payRow?.status).toBe(PaymentStatus.FAILED);
      } finally {
        paymentDriver.createPaymentLink = originalCreateLink;
      }
    });

    it("forbids non-customer staff roles from creating subscription checkouts", async () => {
      const plan = await createSubscriptionPlan(setup.db);
      const res = await request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .set(staffHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          planId: plan.id,
          addressId: innerDistrictAddressId,
          deliveryDay: DeliveryDay.TUESDAY,
        });

      expect(res.status).toBe(403);
    });

    it("rejects unauthenticated and suspended customer requests", async () => {
      const plan = await createSubscriptionPlan(setup.db);

      const unauthCheckout = await request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .set("Idempotency-Key", randomUUID())
        .send({
          planId: plan.id,
          addressId: innerDistrictAddressId,
          deliveryDay: DeliveryDay.TUESDAY,
        });
      expect(unauthCheckout.status).toBe(401);

      const unauthList = await request(app.getHttpServer()).get(
        "/api/v1/subscriptions/me",
      );
      expect(unauthList.status).toBe(401);

      const suspended = await createAuthenticatedUser(setup.db, jwtService, {
        email: "suspended-sub@greenroots.local",
        status: UserStatus.SUSPENDED,
      });
      await insertAddress({
        userId: suspended.user.id,
        receiverName: "Suspended User",
        phoneNumber: "0901112223",
        streetAddress: "123 Lê Lợi",
        placeId: "mock_place_quan_1",
        ward: "Phường Sài Gòn",
        latitude: "10.77560000",
        longitude: "106.70190000",
        isDefault: true,
      });

      const suspendedRes = await request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .set(suspended.authHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          planId: plan.id,
          deliveryDay: DeliveryDay.TUESDAY,
        });
      expect(suspendedRes.status).toBe(403);
      expect((suspendedRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED,
      );
    });
  });

  describe("GET /api/v1/subscriptions/me", () => {
    it("returns paginated customer-owned subscriptions ordered newest first", async () => {
      const plan = await createSubscriptionPlan(setup.db);
      const firstRes = await request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          planId: plan.id,
          addressId: innerDistrictAddressId,
          deliveryDay: DeliveryDay.TUESDAY,
        });
      expect(firstRes.status).toBe(201);

      const secondRes = await request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          planId: plan.id,
          addressId: innerDistrictAddressId,
          deliveryDay: DeliveryDay.FRIDAY,
        });
      expect(secondRes.status).toBe(201);

      const listRes = await request(app.getHttpServer())
        .get("/api/v1/subscriptions/me?page=1&limit=1")
        .set(customerHeader);

      expect(listRes.status).toBe(200);
      const body = listRes.body as ApiResponse<
        SubscriptionResponse[],
        PaginationMeta
      >;
      expect(body.data).toHaveLength(1);
      expect(body.data[0]?.id).toBe(
        (secondRes.body as ApiResponse<SubscriptionResponse>).data.id,
      );
      expect(body.data[0]?.paymentUrl).toBeTruthy();
      expect(body.meta?.total).toBe(2);
      expect(body.meta?.hasNextPage).toBe(true);

      const otherListRes = await request(app.getHttpServer())
        .get("/api/v1/subscriptions/me")
        .set(otherCustomerHeader);
      expect(otherListRes.status).toBe(200);
      expect(
        (otherListRes.body as ApiResponse<SubscriptionResponse[]>).data,
      ).toHaveLength(0);
    });

    it("filters customer subscriptions by status and rejects unknown query parameters", async () => {
      const plan = await createSubscriptionPlan(setup.db);
      const createdRes = await request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          planId: plan.id,
          addressId: innerDistrictAddressId,
          deliveryDay: DeliveryDay.TUESDAY,
        });
      expect(createdRes.status).toBe(201);

      const pendingRes = await request(app.getHttpServer())
        .get(
          `/api/v1/subscriptions/me?status=${SubscriptionStatus.PENDING_PAYMENT}`,
        )
        .set(customerHeader);
      expect(pendingRes.status).toBe(200);
      expect(
        (pendingRes.body as ApiResponse<SubscriptionResponse[]>).data,
      ).toHaveLength(1);

      const activeRes = await request(app.getHttpServer())
        .get(`/api/v1/subscriptions/me?status=${SubscriptionStatus.ACTIVE}`)
        .set(customerHeader);
      expect(activeRes.status).toBe(200);
      expect(
        (activeRes.body as ApiResponse<SubscriptionResponse[]>).data,
      ).toHaveLength(0);

      const unknownQueryRes = await request(app.getHttpServer())
        .get("/api/v1/subscriptions/me?unknownParam=1")
        .set(customerHeader);
      expect(unknownQueryRes.status).toBe(400);
    });
  });

  describe("GET /api/v1/subscriptions/:id", () => {
    it("rejects foreign, missing, or malformed subscription identifiers", async () => {
      const plan = await createSubscriptionPlan(setup.db);
      const createdRes = await request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          planId: plan.id,
          addressId: innerDistrictAddressId,
          deliveryDay: DeliveryDay.TUESDAY,
        });
      expect(createdRes.status).toBe(201);
      const createdId = (createdRes.body as ApiResponse<SubscriptionResponse>)
        .data.id;

      const foreignRes = await request(app.getHttpServer())
        .get(`/api/v1/subscriptions/${createdId}`)
        .set(otherCustomerHeader);
      expect(foreignRes.status).toBe(404);
      expect((foreignRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
      );

      const missingRes = await request(app.getHttpServer())
        .get(`/api/v1/subscriptions/${uuidv7()}`)
        .set(customerHeader);
      expect(missingRes.status).toBe(404);

      const invalidUuidRes = await request(app.getHttpServer())
        .get("/api/v1/subscriptions/not-a-uuid")
        .set(customerHeader);
      expect(invalidUuidRes.status).toBe(400);
    });
  });

  describe("POST /api/v1/subscriptions/:id/cancel", () => {
    it("cancels an owned pending_payment subscription and stays idempotent on replay", async () => {
      const plan = await createSubscriptionPlan(setup.db);
      const createdRes = await request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          planId: plan.id,
          addressId: innerDistrictAddressId,
          deliveryDay: DeliveryDay.TUESDAY,
        });
      expect(createdRes.status).toBe(201);
      const createdId = (createdRes.body as ApiResponse<SubscriptionResponse>)
        .data.id;

      const cancelRes = await request(app.getHttpServer())
        .post(`/api/v1/subscriptions/${createdId}/cancel`)
        .set(customerHeader);
      expect(cancelRes.status).toBe(200);
      const cancelledBody = cancelRes.body as ApiResponse<SubscriptionResponse>;
      expect(cancelledBody.data.status).toBe(SubscriptionStatus.CANCELLED);
      expect(cancelledBody.data.reservationExpiresAt).toBeNull();

      const replayRes = await request(app.getHttpServer())
        .post(`/api/v1/subscriptions/${createdId}/cancel`)
        .set(customerHeader);
      expect(replayRes.status).toBe(200);
      expect(
        (replayRes.body as ApiResponse<SubscriptionResponse>).data.status,
      ).toBe(SubscriptionStatus.CANCELLED);
    });

    it("rejects cancelling foreign or non-pending subscriptions", async () => {
      const plan = await createSubscriptionPlan(setup.db);
      const createdRes = await request(app.getHttpServer())
        .post("/api/v1/subscriptions")
        .set(customerHeader)
        .set("Idempotency-Key", randomUUID())
        .send({
          planId: plan.id,
          addressId: innerDistrictAddressId,
          deliveryDay: DeliveryDay.TUESDAY,
        });
      expect(createdRes.status).toBe(201);
      const createdId = (createdRes.body as ApiResponse<SubscriptionResponse>)
        .data.id;

      const foreignRes = await request(app.getHttpServer())
        .post(`/api/v1/subscriptions/${createdId}/cancel`)
        .set(otherCustomerHeader);
      expect(foreignRes.status).toBe(404);

      await setup.db
        .update(subscriptions)
        .set({ status: SubscriptionStatus.ACTIVE })
        .where(eq(subscriptions.id, createdId));

      const activeRes = await request(app.getHttpServer())
        .post(`/api/v1/subscriptions/${createdId}/cancel`)
        .set(customerHeader);
      expect(activeRes.status).toBe(422);
    });
  });
});
