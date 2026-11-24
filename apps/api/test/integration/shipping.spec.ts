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
  HCMC_DISTRICTS,
  UserRole,
} from "@greenroots/shared";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";
import { RedisService } from "@/common/services/redis.service";
import type { ApiResponse } from "@/common/utils/api-response.util";
import { farms, userAddresses, users } from "@/database/schemas";
import {
  FARM_SETTINGS_CACHE_KEY,
  FARM_SETTINGS_INVALIDATED_AT_KEY,
} from "@/modules/farms/farms.constant";
import { createFarm } from "../factories";
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

type ShippingQuoteResponse = components["schemas"]["ShippingQuoteDto"];

const CONTRACT_QUOTE_KEYS = [
  "feeVnd",
  "isDeliverable",
  "isFreeShipping",
  "maxRadiusKm",
  "roadDistanceKm",
  "straightLineKm",
  "subscriptionFreeRadiusKm",
] as const;

const QUAN_1 = HCMC_DISTRICTS.find((d) => d.code === "quan-1")!;
const BINH_CHANH = HCMC_DISTRICTS.find((d) => d.code === "binh-chanh")!;
const HOC_MON = HCMC_DISTRICTS.find((d) => d.code === "hoc-mon")!;
const CAN_GIO = HCMC_DISTRICTS.find((d) => d.code === "can-gio")!;
const QUAN_7 = HCMC_DISTRICTS.find((d) => d.code === "quan-7")!;
const UUID_V4 = "550e8400-e29b-41d4-a716-446655440000";
const MISSING_UUID_V7 = "019fa8bc-8f4d-7000-b366-e691f45cffff";

describe("Shipping Integration", () => {
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
  let farmStaffHeader: { Authorization: string };
  let adminHeader: { Authorization: string };
  let superAdminHeader: { Authorization: string };

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    jwtService = app.get(JwtService);
    appRedisClient = app.get(RedisService).getClient();
  }, 30000);

  beforeEach(async () => {
    await setup.db.execute(
      sql`TRUNCATE TABLE "user_addresses", "farms", "users" CASCADE;`,
    );
    await cleanScopedRedisKeys(setup.redisClient);
    await appRedisClient
      .unlink(FARM_SETTINGS_CACHE_KEY, FARM_SETTINGS_INVALIDATED_AT_KEY)
      .catch(() => undefined);

    const [
      customerSession,
      otherCustomerSession,
      guestSession,
      salesSession,
      farmStaffSession,
      adminSession,
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
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.FARM_STAFF),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.ADMIN),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.SUPER_ADMIN),
    ]);

    customerId = customerSession.user.id;
    customerHeader = customerSession.authHeader;
    otherCustomerId = otherCustomerSession.user.id;
    otherCustomerHeader = otherCustomerSession.authHeader;
    guestHeader = guestSession.authHeader;
    salesHeader = salesSession.authHeader;
    farmStaffHeader = farmStaffSession.authHeader;
    adminHeader = adminSession.authHeader;
    superAdminHeader = superAdminSession.authHeader;
  });

  afterAll(async () => {
    await appRedisClient
      .unlink(FARM_SETTINGS_CACHE_KEY, FARM_SETTINGS_INVALIDATED_AT_KEY)
      .catch(() => undefined);
    await teardownTestApp(setup);
  });

  describe("POST /api/v1/shipping/quote", () => {
    // Invariant: INV-SHIP-6
    it("rejects unauthenticated callers and non-customer roles", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .send({ districtCode: QUAN_1.code })
        .expect(401);

      for (const header of [
        guestHeader,
        salesHeader,
        farmStaffHeader,
        adminHeader,
        superAdminHeader,
      ]) {
        const res = await request(app.getHttpServer())
          .post("/api/v1/shipping/quote")
          .set(header)
          .send({ districtCode: QUAN_1.code })
          .expect(403);
        expect((res.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.FORBIDDEN,
        );
      }
    });

    // Invariant: INV-SHIP-2
    it("fails closed when the farms table has not been seeded", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .set(customerHeader)
        .send({ districtCode: QUAN_1.code })
        .expect(404);

      expect((res.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.FARM_NOT_FOUND,
      );
    });

    // Invariant: INV-SHIP-1, INV-SHIP-5, INV-SHIP-7
    it("calculates a closed retail quote from districtCode without exposing coordinates", async () => {
      await createFarm(setup.db);

      const res = await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .set(customerHeader)
        .send({ districtCode: QUAN_1.code })
        .expect(200);

      const body = res.body as ApiResponse<ShippingQuoteResponse>;
      expect(body.success).toBe(true);
      expect(Object.keys(body.data).sort()).toEqual([...CONTRACT_QUOTE_KEYS]);
      expect(body.data.isDeliverable).toBe(true);
      expect(body.data.isFreeShipping).toBe(false);
      expect(body.data.feeVnd).toBeGreaterThanOrEqual(
        BUSINESS_RULES.SHIPPING.BASE_FEE_VND,
      );
      expect(Number.isInteger(body.data.feeVnd)).toBe(true);
      expect(body.data.maxRadiusKm).toBe(BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM);
      expect(body.data.subscriptionFreeRadiusKm).toBe(
        BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM,
      );
    });

    // Invariant: INV-SHIP-1, INV-SHIP-4
    it("resolves owned addressId for both retail fees and subscription free radius", async () => {
      await createFarm(setup.db);
      const [savedAddress] = await setup.db
        .insert(userAddresses)
        .values({
          userId: customerId,
          receiverName: "Nguyen Van An",
          phoneNumber: "0912345678",
          streetAddress: "123 Lê Lợi",
          districtCode: QUAN_1.code,
          district: QUAN_1.name,
          city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
          latitude: QUAN_1.latitude.toFixed(8),
          longitude: QUAN_1.longitude.toFixed(8),
          isDefault: true,
        })
        .returning();

      const retailRes = await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .set(customerHeader)
        .send({ addressId: savedAddress!.id, isSubscription: false })
        .expect(200);
      const retailBody = retailRes.body as ApiResponse<ShippingQuoteResponse>;
      expect(retailBody.data.isDeliverable).toBe(true);
      expect(retailBody.data.isFreeShipping).toBe(false);
      expect(retailBody.data.feeVnd).toBeGreaterThanOrEqual(
        BUSINESS_RULES.SHIPPING.BASE_FEE_VND,
      );

      const subRes = await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .set(customerHeader)
        .send({ addressId: savedAddress!.id, isSubscription: true })
        .expect(200);
      const subBody = subRes.body as ApiResponse<ShippingQuoteResponse>;
      expect(subBody.data.isDeliverable).toBe(true);
      expect(subBody.data.isFreeShipping).toBe(true);
      expect(subBody.data.feeVnd).toBe(0);
    });

    // Invariant: INV-SHIP-4, INV-SHIP-5
    it("charges standard fee for subscription deliveries between 20km and 25km", async () => {
      await createFarm(setup.db);

      const retailRes = await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .set(customerHeader)
        .send({ districtCode: BINH_CHANH.code, isSubscription: false })
        .expect(200);
      const subRes = await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .set(customerHeader)
        .send({ districtCode: BINH_CHANH.code, isSubscription: true })
        .expect(200);

      const retailQuote = (retailRes.body as ApiResponse<ShippingQuoteResponse>)
        .data;
      const subQuote = (subRes.body as ApiResponse<ShippingQuoteResponse>).data;

      expect(subQuote.roadDistanceKm).toBeGreaterThan(20);
      expect(subQuote.roadDistanceKm).toBeLessThanOrEqual(25);
      expect(subQuote.isDeliverable).toBe(true);
      expect(subQuote.isFreeShipping).toBe(false);
      expect(subQuote.feeVnd).toBe(retailQuote.feeVnd);
      expect(subQuote.feeVnd).toBeGreaterThan(0);
    });

    // Invariant: INV-SHIP-3
    it("marks destinations beyond the configured maximum radius as undeliverable with a null fee", async () => {
      await createFarm(setup.db);

      const res = await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .set(customerHeader)
        .send({ districtCode: CAN_GIO.code, isSubscription: true })
        .expect(200);

      const body = res.body as ApiResponse<ShippingQuoteResponse>;
      expect(body.data.roadDistanceKm).toBeGreaterThan(25);
      expect(body.data.isDeliverable).toBe(false);
      expect(body.data.isFreeShipping).toBe(false);
      expect(body.data.feeVnd).toBeNull();
    });

    // Invariant: INV-SHIP-2, INV-SHIP-3
    it("reflects dynamic FarmSettings updates immediately and guards against subscriptionFreeRadiusKm exceeding maxRadiusKm", async () => {
      const farm = await createFarm(setup.db);

      // Seed misconfigured radii directly in PostgreSQL since PATCH enforces subscriptionFreeRadiusKm <= maxRadiusKm.
      await setup.db
        .update(farms)
        .set({
          shippingConfig: {
            baseFeeVnd: 30000,
            freeKmThreshold: 5,
            perKmRateVnd: 7000,
            detourFactor: 1.4,
            maxRadiusKm: 25,
            subscriptionFreeRadiusKm: 150,
          },
        })
        .where(eq(farms.id, farm.id));
      await appRedisClient.unlink(FARM_SETTINGS_CACHE_KEY);

      const canGioRes = await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .set(customerHeader)
        .send({ districtCode: CAN_GIO.code, isSubscription: true })
        .expect(200);
      expect(
        (canGioRes.body as ApiResponse<ShippingQuoteResponse>).data,
      ).toMatchObject({
        isDeliverable: false,
        isFreeShipping: false,
        feeVnd: null,
        maxRadiusKm: 25,
        subscriptionFreeRadiusKm: 150,
      });

      const quan1Res = await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .set(customerHeader)
        .send({ districtCode: QUAN_1.code, isSubscription: false })
        .expect(200);
      expect(
        (quan1Res.body as ApiResponse<ShippingQuoteResponse>).data.feeVnd,
      ).toBeGreaterThanOrEqual(30000);

      const hocMonBaseline = await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .set(customerHeader)
        .send({ districtCode: HOC_MON.code, isSubscription: false })
        .expect(200);
      const exactDistance = (
        hocMonBaseline.body as ApiResponse<ShippingQuoteResponse>
      ).data.roadDistanceKm;

      await request(app.getHttpServer())
        .patch("/api/v1/farms/settings")
        .set(superAdminHeader)
        .send({
          shippingConfig: {
            baseFeeVnd: 15000,
            freeKmThreshold: 3,
            perKmRateVnd: 5000,
            detourFactor: 1.4,
            maxRadiusKm: exactDistance,
            subscriptionFreeRadiusKm: exactDistance,
          },
        })
        .expect(200);

      const exactBoundaryRes = await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .set(customerHeader)
        .send({ districtCode: HOC_MON.code, isSubscription: true })
        .expect(200);
      expect(
        (exactBoundaryRes.body as ApiResponse<ShippingQuoteResponse>).data,
      ).toMatchObject({
        roadDistanceKm: exactDistance,
        isDeliverable: true,
        isFreeShipping: true,
        feeVnd: 0,
      });
    });

    // Invariant: INV-SHIP-1, INV-SHIP-6
    it("rejects XOR violations, coordinate injection, and invalid addressId format", async () => {
      await createFarm(setup.db);

      const missingTarget = await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .set(customerHeader)
        .send({})
        .expect(400);
      const missingBody = missingTarget.body as Rfc9457ProblemDetails;
      expect(missingBody.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
      expect(missingBody.invalidParams.map((p) => p.code)).toContain(
        API_ERROR_CODES.CUSTOM_VALIDATION_ERROR,
      );

      const bothTargets = await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .set(customerHeader)
        .send({
          addressId: "019fa8bc-8f4d-7000-b366-e691f45cfb91",
          districtCode: QUAN_7.code,
        })
        .expect(400);
      const bothBody = bothTargets.body as Rfc9457ProblemDetails;
      expect(bothBody.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
      expect(bothBody.invalidParams.map((p) => p.code)).toContain(
        API_ERROR_CODES.CUSTOM_VALIDATION_ERROR,
      );

      const injectedCoords = await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .set(customerHeader)
        .send({
          districtCode: QUAN_1.code,
          latitude: 10.8106,
          longitude: 106.7091,
        })
        .expect(400);
      expect((injectedCoords.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.VALIDATION_FAILED,
      );
      expect(
        (injectedCoords.body as Rfc9457ProblemDetails).invalidParams.map(
          (p) => p.code,
        ),
      ).toContain(API_ERROR_CODES.UNRECOGNIZED_KEYS);

      await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .set(customerHeader)
        .send({ addressId: UUID_V4 })
        .expect(400);
    });

    it("rejects an unknown district code", async () => {
      await createFarm(setup.db);

      const res = await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .set(customerHeader)
        .send({ districtCode: "quan-99" })
        .expect(422);

      expect((res.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.DISTRICT_CODE_INVALID,
      );
    });

    // Invariant: INV-SHIP-6
    it("isolates saved address ownership and rejects soft-deleted users on addressId quotes", async () => {
      await createFarm(setup.db);
      const [foreignAddress] = await setup.db
        .insert(userAddresses)
        .values({
          userId: otherCustomerId,
          receiverName: "Tran Thi Binh",
          phoneNumber: "0987654321",
          streetAddress: "99 Nguyen Hue",
          districtCode: QUAN_7.code,
          district: QUAN_7.name,
          city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
          latitude: QUAN_7.latitude.toFixed(8),
          longitude: QUAN_7.longitude.toFixed(8),
          isDefault: true,
        })
        .returning();

      const foreignRes = await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .set(customerHeader)
        .send({ addressId: foreignAddress!.id })
        .expect(404);
      expect((foreignRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.ADDRESS_NOT_FOUND,
      );

      const missingRes = await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .set(customerHeader)
        .send({ addressId: MISSING_UUID_V7 })
        .expect(404);
      expect((missingRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.ADDRESS_NOT_FOUND,
      );

      await setup.db
        .update(users)
        .set({ deletedAt: new Date() })
        .where(eq(users.id, otherCustomerId));

      const deletedRes = await request(app.getHttpServer())
        .post("/api/v1/shipping/quote")
        .set(otherCustomerHeader)
        .send({ addressId: foreignAddress!.id })
        .expect(401);
      expect((deletedRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
      );
    });
  });
});
