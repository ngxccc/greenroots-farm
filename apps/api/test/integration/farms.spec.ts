import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test";
import request from "supertest";
import { type INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { eq, sql } from "drizzle-orm";
import { API_ERROR_CODES, SeasonStatus, UserRole } from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";
import { RedisService } from "@/common/services/redis.service";
import type { ApiResponse } from "@/common/utils/api-response.util";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";
import { farms, plots } from "@/database/schemas";
import {
  FARM_SETTINGS_CACHE_KEY,
  FARM_SETTINGS_CACHE_TTL_SECONDS,
  FARM_SETTINGS_INVALIDATED_AT_KEY,
} from "@/modules/farms/farms.interface";
import { createFarm, createPlot, createSeason, PlotMother } from "../factories";
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

type FarmSettingsSchema = components["schemas"]["FarmSettingsDto"];
type PlotSchema = components["schemas"]["PlotDto"];
type PaginationMetaSchema = components["schemas"]["PaginationMetaDto"];

function validCloudinaryUrl(folder: "farms" | "plots", name: string): string {
  return `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/v1/${folder}/${name}`;
}

describe("Farms Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let jwtService: JwtService;
  let appRedisClient: ReturnType<RedisService["getClient"]>;

  let customerHeader: { Authorization: string };
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
      sql`TRUNCATE TABLE "seasons", "plots", "farms", "users" CASCADE;`,
    );
    await cleanScopedRedisKeys(setup.redisClient);
    await appRedisClient
      .unlink(FARM_SETTINGS_CACHE_KEY, FARM_SETTINGS_INVALIDATED_AT_KEY)
      .catch(() => undefined);

    const [
      customerSession,
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
        role: UserRole.GUEST,
      }),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.SALES),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.FARM_STAFF),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.ADMIN),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.SUPER_ADMIN),
    ]);

    customerHeader = customerSession.authHeader;
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

  describe("GET /api/v1/farms/settings", () => {
    it("rejects unauthenticated callers and non-admin staff roles", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/farms/settings")
        .expect(401);

      for (const header of [
        customerHeader,
        guestHeader,
        salesHeader,
        farmStaffHeader,
      ]) {
        const res = await request(app.getHttpServer())
          .get("/api/v1/farms/settings")
          .set(header)
          .expect(403);
        const body = res.body as Rfc9457ProblemDetails;
        expect(body.code).toBe(API_ERROR_CODES.FORBIDDEN);
      }
    });

    // Invariant: INV-FARM-1
    it("returns farm not found when the farms table has not been seeded", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/farms/settings")
        .set(adminHeader)
        .expect(404);

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.code).toBe(API_ERROR_CODES.FARM_NOT_FOUND);
    });

    // Invariant: INV-FARM-2
    it("returns singleton farm settings to admin and super_admin and populates the 24h Redis cache", async () => {
      const farm = await createFarm(setup.db);

      const firstRes = await request(app.getHttpServer())
        .get("/api/v1/farms/settings")
        .set(adminHeader)
        .expect(200);

      const firstBody = firstRes.body as ApiResponse<FarmSettingsSchema>;
      expect(firstBody.success).toBe(true);
      expect(firstBody.data.id).toBe(farm.id);
      expect(firstBody.data.latitude).toBeCloseTo(11.0067, 4);
      expect(firstBody.data.longitude).toBeCloseTo(106.5132, 4);

      const cachedRaw = await appRedisClient.get(FARM_SETTINGS_CACHE_KEY);
      expect(cachedRaw).not.toBeNull();
      const ttl = await appRedisClient.ttl(FARM_SETTINGS_CACHE_KEY);
      expect(ttl).toBeGreaterThan(86000);
      expect(ttl).toBeLessThanOrEqual(FARM_SETTINGS_CACHE_TTL_SECONDS);

      // Direct SQL update without invalidation proves the second read hits Redis rather than DB.
      await setup.db
        .update(farms)
        .set({ name: "Bypassed Cache Name" })
        .where(eq(farms.id, farm.id));

      const secondRes = await request(app.getHttpServer())
        .get("/api/v1/farms/settings")
        .set(superAdminHeader)
        .expect(200);

      const secondBody = secondRes.body as ApiResponse<FarmSettingsSchema>;
      expect(secondBody.data.name).toBe(farm.name);
    });

    // Invariant: INV-FARM-2
    it("falls back to PostgreSQL when Redis cache is corrupt or unreachable", async () => {
      const farm = await createFarm(setup.db);
      await appRedisClient.set(FARM_SETTINGS_CACHE_KEY, "{not-valid-json");

      const corruptRes = await request(app.getHttpServer())
        .get("/api/v1/farms/settings")
        .set(adminHeader)
        .expect(200);
      expect((corruptRes.body as ApiResponse<FarmSettingsSchema>).data.id).toBe(
        farm.id,
      );

      const getSpy = spyOn(appRedisClient, "get").mockRejectedValueOnce(
        new Error("Redis ECONNREFUSED"),
      );
      try {
        const offlineRes = await request(app.getHttpServer())
          .get("/api/v1/farms/settings")
          .set(adminHeader)
          .expect(200);
        expect(
          (offlineRes.body as ApiResponse<FarmSettingsSchema>).data.id,
        ).toBe(farm.id);
      } finally {
        getSpy.mockRestore();
      }
    });

    // Invariant: INV-FARM-2
    it("skips cache backfill when a write invalidation marker is newer than the DB read start", async () => {
      const farm = await createFarm(setup.db);
      await appRedisClient.set(
        FARM_SETTINGS_INVALIDATED_AT_KEY,
        String(Date.now() + 60_000),
        "EX",
        60,
      );

      const res = await request(app.getHttpServer())
        .get("/api/v1/farms/settings")
        .set(adminHeader)
        .expect(200);

      expect((res.body as ApiResponse<FarmSettingsSchema>).data.id).toBe(
        farm.id,
      );
      const cached = await appRedisClient.get(FARM_SETTINGS_CACHE_KEY);
      expect(cached).toBeNull();
    });
  });

  describe("PATCH /api/v1/farms/settings", () => {
    // Invariant: INV-FARM-1
    it("returns farm not found when patching an unseeded farms table", async () => {
      const res = await request(app.getHttpServer())
        .patch("/api/v1/farms/settings")
        .set(superAdminHeader)
        .send({ name: "Unseeded Update" })
        .expect(404);
      expect((res.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.FARM_NOT_FOUND,
      );
    });

    it("forbids admin and lower roles from updating farm settings", async () => {
      await createFarm(setup.db);

      for (const header of [
        customerHeader,
        guestHeader,
        salesHeader,
        farmStaffHeader,
        adminHeader,
      ]) {
        const res = await request(app.getHttpServer())
          .patch("/api/v1/farms/settings")
          .set(header)
          .send({ name: "Unauthorized Update" })
          .expect(403);
        expect((res.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.FORBIDDEN,
        );
      }
    });

    // Invariant: INV-FARM-2, INV-FARM-4
    it("updates validated settings, clears nullable fields, and unlinks the Redis cache", async () => {
      await createFarm(setup.db);

      await request(app.getHttpServer())
        .get("/api/v1/farms/settings")
        .set(superAdminHeader)
        .expect(200);
      expect(await appRedisClient.get(FARM_SETTINGS_CACHE_KEY)).not.toBeNull();

      const newCertUrl = validCloudinaryUrl("farms", "vietgap-2026.png");
      const updateRes = await request(app.getHttpServer())
        .patch("/api/v1/farms/settings")
        .set(superAdminHeader)
        .send({
          name: "GreenRoots Organic Củ Chi",
          certificationUrl: newCertUrl,
          bankInfo: null,
          shippingConfig: {
            baseFeeVnd: 20000,
            freeKmThreshold: 5,
            perKmRateVnd: 6000,
            detourFactor: 1.35,
            maxRadiusKm: 30,
            subscriptionFreeRadiusKm: 22,
          },
          flashSaleConfig: {
            hoursThreshold: 36,
            discountPercent: 40,
          },
        })
        .expect(200);

      const updateBody = updateRes.body as ApiResponse<FarmSettingsSchema>;
      expect(updateBody.data.name).toBe("GreenRoots Organic Củ Chi");
      expect(updateBody.data.certificationUrl).toBe(newCertUrl);
      expect(updateBody.data.bankInfo).toBeNull();
      expect(updateBody.data.shippingConfig.maxRadiusKm).toBe(30);
      expect(updateBody.data.flashSaleConfig.discountPercent).toBe(40);

      expect(await appRedisClient.get(FARM_SETTINGS_CACHE_KEY)).toBeNull();

      const refreshedRes = await request(app.getHttpServer())
        .get("/api/v1/farms/settings")
        .set(adminHeader)
        .expect(200);
      expect(
        (refreshedRes.body as ApiResponse<FarmSettingsSchema>).data.name,
      ).toBe("GreenRoots Organic Củ Chi");
    });

    it("rejects empty payloads, unknown fields, negative VND, and non-Cloudinary URLs", async () => {
      await createFarm(setup.db);

      await request(app.getHttpServer())
        .patch("/api/v1/farms/settings")
        .set(superAdminHeader)
        .send({})
        .expect(400);

      const unknownRes = await request(app.getHttpServer())
        .patch("/api/v1/farms/settings")
        .set(superAdminHeader)
        .send({ name: "Valid", unknownKey: true })
        .expect(400);
      expect(
        (unknownRes.body as Rfc9457ProblemDetails).invalidParams.some(
          (param) => param.code === API_ERROR_CODES.UNRECOGNIZED_KEYS,
        ),
      ).toBe(true);

      await request(app.getHttpServer())
        .patch("/api/v1/farms/settings")
        .set(superAdminHeader)
        .send({
          shippingConfig: {
            baseFeeVnd: -100,
            freeKmThreshold: 3,
            perKmRateVnd: 5000,
            detourFactor: 1.3,
          },
        })
        .expect(400);

      await request(app.getHttpServer())
        .patch("/api/v1/farms/settings")
        .set(superAdminHeader)
        .send({
          certificationUrl: "https://evil.example.com/cert.png",
        })
        .expect(400);
    });

    // Invariant: INV-FARM-3
    it("rejects updates that disable both PayOS and COD concurrently", async () => {
      await createFarm(setup.db);

      const directRes = await request(app.getHttpServer())
        .patch("/api/v1/farms/settings")
        .set(superAdminHeader)
        .send({ isPayosEnabled: false, isCodEnabled: false })
        .expect(422);
      expect((directRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.FARM_PAYMENT_METHOD_REQUIRED,
      );

      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .patch("/api/v1/farms/settings")
          .set(superAdminHeader)
          .send({ isPayosEnabled: false }),
        request(app.getHttpServer())
          .patch("/api/v1/farms/settings")
          .set(superAdminHeader)
          .send({ isCodEnabled: false }),
      ]);

      const statuses = [resA.status, resB.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 422]);

      const persisted = await request(app.getHttpServer())
        .get("/api/v1/farms/settings")
        .set(adminHeader)
        .expect(200);
      const data = (persisted.body as ApiResponse<FarmSettingsSchema>).data;
      expect(data.isPayosEnabled || data.isCodEnabled).toBe(true);
    });
  });

  describe("GET /api/v1/plots", () => {
    it("allows all internal staff roles and forbids customer and guest", async () => {
      const farm = await createFarm(setup.db);
      await createPlot(setup.db, { farmId: farm.id, plotCode: "PLOT-01" });

      for (const header of [customerHeader, guestHeader]) {
        await request(app.getHttpServer())
          .get("/api/v1/plots")
          .set(header)
          .expect(403);
      }

      for (const header of [
        salesHeader,
        farmStaffHeader,
        adminHeader,
        superAdminHeader,
      ]) {
        const res = await request(app.getHttpServer())
          .get("/api/v1/plots")
          .set(header)
          .expect(200);
        const body = res.body as ApiResponse<
          PlotSchema[],
          PaginationMetaSchema
        >;
        expect(body.data).toHaveLength(1);
        expect(body.meta?.total).toBe(1);
      }
    });

    // Invariant: INV-PLOT-1
    it("excludes soft-deleted plots, supports pagination and sorting, and escapes search wildcards", async () => {
      const farm = await createFarm(setup.db);
      await createPlot(setup.db, {
        farmId: farm.id,
        plotCode: "PLOT-ALPHA",
        name: "Nhà kính 100% hữu cơ",
        areaSqm: "500.00",
      });
      await createPlot(setup.db, {
        farmId: farm.id,
        plotCode: "PLOT-BETA",
        name: "Nhà kính rau sạch",
        areaSqm: "1500.00",
      });
      await createPlot(setup.db, {
        farmId: farm.id,
        plotCode: "PLOT-DELETED",
        name: "Deleted 100%",
        areaSqm: "900.00",
        deletedAt: new Date(),
      });

      const listRes = await request(app.getHttpServer())
        .get("/api/v1/plots?sort=areaSqm:desc&page=1&limit=1")
        .set(farmStaffHeader)
        .expect(200);
      const listBody = listRes.body as ApiResponse<
        PlotSchema[],
        PaginationMetaSchema
      >;
      expect(listBody.data).toHaveLength(1);
      expect(listBody.data[0]?.plotCode).toBe("PLOT-BETA");
      expect(listBody.data[0]?.areaSqm).toBe(1500);
      expect(listBody.meta?.total).toBe(2);
      expect(listBody.meta?.hasNextPage).toBe(true);

      const searchRes = await request(app.getHttpServer())
        .get("/api/v1/plots?q=100%25")
        .set(salesHeader)
        .expect(200);
      const searchBody = searchRes.body as ApiResponse<
        PlotSchema[],
        PaginationMetaSchema
      >;
      expect(searchBody.data).toHaveLength(1);
      expect(searchBody.data[0]?.plotCode).toBe("PLOT-ALPHA");

      await request(app.getHttpServer())
        .get("/api/v1/plots?unknownParam=1")
        .set(farmStaffHeader)
        .expect(400);
    });
  });

  describe("GET /api/v1/plots/:id", () => {
    // Invariant: INV-PLOT-1
    it("returns active plot details, rejects non-UUIDv7 params, and hides soft-deleted plots", async () => {
      const farm = await createFarm(setup.db);
      const activePlot = await createPlot(
        setup.db,
        PlotMother.withLabTests({ farmId: farm.id, plotCode: "PLOT-LIVE" }),
      );
      const deletedPlot = await createPlot(setup.db, {
        farmId: farm.id,
        plotCode: "PLOT-GONE",
        deletedAt: new Date(),
      });

      const okRes = await request(app.getHttpServer())
        .get(`/api/v1/plots/${activePlot.id}`)
        .set(salesHeader)
        .expect(200);
      expect((okRes.body as ApiResponse<PlotSchema>).data.plotCode).toBe(
        "PLOT-LIVE",
      );

      const missingRes = await request(app.getHttpServer())
        .get(`/api/v1/plots/${deletedPlot.id}`)
        .set(farmStaffHeader)
        .expect(404);
      expect((missingRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.PLOT_NOT_FOUND,
      );

      const badIdRes = await request(app.getHttpServer())
        .get("/api/v1/plots/not-a-uuid")
        .set(farmStaffHeader)
        .expect(400);
      const badIdBody = badIdRes.body as Rfc9457ProblemDetails;
      expect(badIdBody.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
      expect(badIdBody.invalidParams[0]?.code).toBe(
        API_ERROR_CODES.INVALID_FORMAT,
      );
    });
  });

  describe("POST /api/v1/plots", () => {
    it("forbids sales and customer roles while allowing farm_staff, admin, and super_admin", async () => {
      await createFarm(setup.db);

      for (const header of [customerHeader, guestHeader, salesHeader]) {
        await request(app.getHttpServer())
          .post("/api/v1/plots")
          .set(header)
          .send({ plotCode: "PLOT-X", name: "Test", areaSqm: 100 })
          .expect(403);
      }

      const res = await request(app.getHttpServer())
        .post("/api/v1/plots")
        .set(farmStaffHeader)
        .send({
          plotCode: "PLOT-STAFF-1",
          name: "Lô rau ăn lá",
          areaSqm: 750.5,
          soilTestResult: {
            ph: 6.4,
            nitrogen_ppm: 42,
            phosphorus_ppm: 28,
            potassium_ppm: 35,
            heavy_metals: { lead_ppm: 0.02, cadmium_ppm: 0.01, pass: true },
            tested_at: "2026-11-10T02:00:00.000Z",
            certificate_url: validCloudinaryUrl("plots", "soil-1.png"),
          },
          waterTestResult: {
            ph: 7.1,
            ec_ms_cm: 0.8,
            dissolved_oxygen_ppm: 6.5,
            e_coli_cfu_100ml: 0,
            heavy_metals_pass: true,
            tested_at: "2026-11-10T02:00:00.000Z",
            certificate_url: validCloudinaryUrl("plots", "water-1.png"),
          },
        })
        .expect(201);

      const body = res.body as ApiResponse<PlotSchema>;
      expect(body.data.plotCode).toBe("PLOT-STAFF-1");
      expect(body.data.areaSqm).toBe(750.5);
      expect(body.data.soilTestResult?.certificate_url).toBe(
        validCloudinaryUrl("plots", "soil-1.png"),
      );
    });

    // Invariant: INV-PLOT-3, INV-PLOT-5, INV-FARM-4
    it("rejects non-positive area, unknown fields, and invalid certificate URLs at DTO and DB layers", async () => {
      const farm = await createFarm(setup.db);

      await request(app.getHttpServer())
        .post("/api/v1/plots")
        .set(farmStaffHeader)
        .send({ plotCode: "PLOT-ZERO", name: "Zero", areaSqm: 0 })
        .expect(400);

      await request(app.getHttpServer())
        .post("/api/v1/plots")
        .set(farmStaffHeader)
        .send({ plotCode: "PLOT-SUBCENT", name: "Sub-cent", areaSqm: 0.001 })
        .expect(400);

      await request(app.getHttpServer())
        .post("/api/v1/plots")
        .set(farmStaffHeader)
        .send({
          plotCode: "PLOT-QUERY-URL",
          name: "Query Url",
          areaSqm: 200,
          soilTestResult: {
            ph: 6.5,
            nitrogen_ppm: 10,
            phosphorus_ppm: 10,
            potassium_ppm: 10,
            heavy_metals: { lead_ppm: 0, cadmium_ppm: 0, pass: true },
            tested_at: "2026-11-10T02:00:00.000Z",
            certificate_url: `${validCloudinaryUrl("plots", "soil.png")}?foo=bar#frag`,
          },
        })
        .expect(400);

      const unknownFieldRes = await request(app.getHttpServer())
        .post("/api/v1/plots")
        .set(farmStaffHeader)
        .send({
          plotCode: "PLOT-EXTRA",
          name: "Extra",
          areaSqm: 200,
          extraField: "nope",
        })
        .expect(400);
      expect(
        (unknownFieldRes.body as Rfc9457ProblemDetails).invalidParams.some(
          (param) => param.code === API_ERROR_CODES.UNRECOGNIZED_KEYS,
        ),
      ).toBe(true);

      await request(app.getHttpServer())
        .post("/api/v1/plots")
        .set(farmStaffHeader)
        .send({
          plotCode: "PLOT-BAD-URL",
          name: "Bad Url",
          areaSqm: 200,
          waterTestResult: {
            ph: 7,
            ec_ms_cm: 0.8,
            dissolved_oxygen_ppm: 6,
            e_coli_cfu_100ml: 0,
            heavy_metals_pass: true,
            tested_at: "2026-11-10T02:00:00.000Z",
            certificate_url: "https://evil.example.com/water.pdf",
          },
        })
        .expect(400);

      // Direct SQL verify of DB CHECK constraint plots_area_sqm_positive_chk.
      try {
        await setup.db.insert(plots).values({
          farmId: farm.id,
          plotCode: "PLOT-NEG-SQL",
          name: "Negative SQL",
          areaSqm: "-10.00",
        });
        expect.unreachable("Expected CHECK constraint violation (23514)");
      } catch (error) {
        const dbError = extractDatabaseErrorDetails(error);
        expect(dbError.code).toBe(PG_ERROR_CODE.CHECK_VIOLATION);
        expect(dbError.constraint).toBe("plots_area_sqm_positive_chk");
      }
    });

    // Invariant: INV-PLOT-2
    it("enforces unique active plotCode under concurrency and permits reuse after soft delete", async () => {
      const farm = await createFarm(setup.db);

      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .post("/api/v1/plots")
          .set(farmStaffHeader)
          .send({ plotCode: "PLOT-RACE", name: "Race A", areaSqm: 100 }),
        request(app.getHttpServer())
          .post("/api/v1/plots")
          .set(farmStaffHeader)
          .send({ plotCode: "PLOT-RACE", name: "Race B", areaSqm: 200 }),
      ]);

      const statuses = [resA.status, resB.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);

      const conflictBody = (
        resA.status === 409 ? resA.body : resB.body
      ) as Rfc9457ProblemDetails;
      expect(conflictBody.code).toBe(API_ERROR_CODES.PLOT_CODE_ALREADY_EXISTS);

      const createdId = (
        (resA.status === 201 ? resA.body : resB.body) as ApiResponse<PlotSchema>
      ).data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/plots/${createdId}`)
        .set(adminHeader)
        .expect(204);

      const reuseRes = await request(app.getHttpServer())
        .post("/api/v1/plots")
        .set(farmStaffHeader)
        .send({
          farmId: undefined,
          plotCode: "PLOT-RACE",
          name: "Reused Code",
          areaSqm: 300,
        });
      // Undefined key is stripped by JSON serialization; confirm 201 reuse works.
      expect(reuseRes.status).toBe(201);
      expect((reuseRes.body as ApiResponse<PlotSchema>).data.farmId).toBe(
        farm.id,
      );
    });
  });

  describe("PATCH /api/v1/plots/:id", () => {
    it("updates plot fields, clears lab results when passed null, and rejects duplicates", async () => {
      const farm = await createFarm(setup.db);
      const plotA = await createPlot(
        setup.db,
        PlotMother.withLabTests({ farmId: farm.id, plotCode: "PLOT-A" }),
      );
      await createPlot(setup.db, { farmId: farm.id, plotCode: "PLOT-B" });

      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/plots/${plotA.id}`)
        .set(farmStaffHeader)
        .send({
          name: "Lô A Đã Cập Nhật",
          areaSqm: 1850.25,
          soilTestResult: null,
        })
        .expect(200);

      const updated = (updateRes.body as ApiResponse<PlotSchema>).data;
      expect(updated.name).toBe("Lô A Đã Cập Nhật");
      expect(updated.areaSqm).toBe(1850.25);
      expect(updated.soilTestResult).toBeNull();
      expect(updated.waterTestResult).not.toBeNull();

      const dupRes = await request(app.getHttpServer())
        .patch(`/api/v1/plots/${plotA.id}`)
        .set(adminHeader)
        .send({ plotCode: "PLOT-B" })
        .expect(409);
      expect((dupRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.PLOT_CODE_ALREADY_EXISTS,
      );

      const missingPatchRes = await request(app.getHttpServer())
        .patch("/api/v1/plots/019fa8bc-8f4d-7000-b366-e691f45cffff")
        .set(adminHeader)
        .send({ name: "Missing" })
        .expect(404);
      expect((missingPatchRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.PLOT_NOT_FOUND,
      );
    });
  });

  describe("DELETE /api/v1/plots/:id", () => {
    it("forbids farm_staff and sales while allowing admin and super_admin", async () => {
      const farm = await createFarm(setup.db);
      const plot = await createPlot(setup.db, { farmId: farm.id });

      for (const header of [
        customerHeader,
        guestHeader,
        salesHeader,
        farmStaffHeader,
      ]) {
        await request(app.getHttpServer())
          .delete(`/api/v1/plots/${plot.id}`)
          .set(header)
          .expect(403);
      }
    });

    // Invariant: INV-PLOT-4
    it("blocks soft delete when planning or active seasons exist and succeeds when only harvested seasons remain", async () => {
      const farm = await createFarm(setup.db);
      const activeSeasonPlot = await createPlot(setup.db, { farmId: farm.id });
      await createSeason(setup.db, {
        plotId: activeSeasonPlot.id,
        status: SeasonStatus.PLANNING,
      });

      const conflictRes = await request(app.getHttpServer())
        .delete(`/api/v1/plots/${activeSeasonPlot.id}`)
        .set(adminHeader)
        .expect(409);
      expect((conflictRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.PLOT_HAS_ACTIVE_SEASONS,
      );

      const [stillLive] = await setup.db
        .select({ deletedAt: plots.deletedAt })
        .from(plots)
        .where(eq(plots.id, activeSeasonPlot.id));
      expect(stillLive?.deletedAt).toBeNull();

      const completedSeasonPlot = await createPlot(setup.db, {
        farmId: farm.id,
      });
      await createSeason(setup.db, {
        plotId: completedSeasonPlot.id,
        status: SeasonStatus.HARVESTED,
      });

      await request(app.getHttpServer())
        .delete(`/api/v1/plots/${completedSeasonPlot.id}`)
        .set(superAdminHeader)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/api/v1/plots/${completedSeasonPlot.id}`)
        .set(adminHeader)
        .expect(404);

      const missingDeleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/plots/${completedSeasonPlot.id}`)
        .set(adminHeader)
        .expect(404);
      expect((missingDeleteRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.PLOT_NOT_FOUND,
      );
    });
  });
});
