import { randomUUID } from "node:crypto";
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
import { API_ERROR_CODES, BatchStatus, UserRole } from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { IDEMPOTENCY_HEADER_NAME } from "@/common/constants/idempotency.constant";
import { TIME_IN_MS } from "@/common/constants/time.constant";
import {
  formatVnCalendarDate,
  formatVnCompactDate,
} from "@/common/utils/time.util";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";
import { RedisService } from "@/common/services/redis.service";
import type { ApiResponse } from "@/common/utils/api-response.util";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";
import { batches, products } from "@/database/schemas";
import { BatchesService } from "@/modules/inventory/batches.service";
import {
  FARM_SETTINGS_CACHE_KEY,
  FARM_SETTINGS_INVALIDATED_AT_KEY,
  TRACE_CACHE_PREFIX,
  TRACE_FARM_VERSION_KEY,
  TRACE_INVALIDATED_AT_PREFIX,
  TRACE_MISS_CACHE_PREFIX,
} from "@/modules/farms/farms.constant";
import {
  BatchMother,
  createBatch,
  createFarm,
  createPlot,
  createProduct,
  createSeason,
  ProductMother,
  SeasonMother,
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

type BatchSchema = components["schemas"]["BatchDto"];
type NearExpiryBatchSchema = components["schemas"]["NearExpiryBatchDto"];
type BatchQrLabelSchema = components["schemas"]["BatchQrLabelDto"];
type TraceRecordSchema = components["schemas"]["TraceRecordDto"];
type PaginationMetaSchema = components["schemas"]["PaginationMetaDto"];

const UNKNOWN_UUID_V7 = "019fa8bc-8f4d-7000-b366-e691f45cffff";

describe("Batches Integration", () => {
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
      sql`TRUNCATE TABLE "batches", "products", "categories", "farming_logs", "seasons", "plots", "farms", "users" CASCADE;`,
    );
    await cleanScopedRedisKeys(setup.redisClient);
    await appRedisClient
      .unlink(
        FARM_SETTINGS_CACHE_KEY,
        FARM_SETTINGS_INVALIDATED_AT_KEY,
        TRACE_FARM_VERSION_KEY,
      )
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
    await teardownTestApp(setup);
  });

  describe("RBAC Matrix", () => {
    it("forbids unauthenticated, guest, customer, and sales callers across batch endpoints", async () => {
      const farm = await createFarm(setup.db);
      const plot = await createPlot(setup.db, { farmId: farm.id });
      const season = await createSeason(
        setup.db,
        SeasonMother.active({ plotId: plot.id }),
      );
      const product = await createProduct(setup.db);
      const batch = await createBatch(setup.db, {
        seasonId: season.id,
        productId: product.id,
      });

      await request(app.getHttpServer()).get("/api/v1/batches").expect(401);
      await request(app.getHttpServer())
        .get(`/api/v1/batches/${batch.id}`)
        .expect(401);
      await request(app.getHttpServer())
        .get(`/api/v1/batches/${batch.id}/qr-label`)
        .expect(401);
      await request(app.getHttpServer())
        .post("/api/v1/batches")
        .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
        .send({
          productId: product.id,
          seasonId: season.id,
          harvestDate: new Date(Date.now() - 3600_000).toISOString(),
          shelfLifeDays: 5,
          initialQuantity: 10,
        })
        .expect(401);

      for (const header of [guestHeader, customerHeader, salesHeader]) {
        await request(app.getHttpServer())
          .get("/api/v1/batches")
          .set(header)
          .expect(403);
        await request(app.getHttpServer())
          .get(`/api/v1/batches/${batch.id}`)
          .set(header)
          .expect(403);
        await request(app.getHttpServer())
          .get(`/api/v1/batches/${batch.id}/qr-label`)
          .set(header)
          .expect(403);
        await request(app.getHttpServer())
          .post("/api/v1/batches")
          .set(header)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            productId: product.id,
            seasonId: season.id,
            harvestDate: new Date(Date.now() - 3600_000).toISOString(),
            shelfLifeDays: 5,
            initialQuantity: 10,
          })
          .expect(403);
      }
    });

    it("allows farm_staff, admin, and super_admin to create and read batches", async () => {
      const farm = await createFarm(setup.db);
      const plot = await createPlot(setup.db, { farmId: farm.id });
      const season = await createSeason(
        setup.db,
        SeasonMother.active({
          plotId: plot.id,
          startDate: "2020-01-01",
        }),
      );
      const product = await createProduct(setup.db);
      const harvestIso = new Date(Date.now() - 60_000).toISOString();

      for (const header of [farmStaffHeader, adminHeader, superAdminHeader]) {
        const res = await request(app.getHttpServer())
          .post("/api/v1/batches")
          .set(header)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            productId: product.id,
            seasonId: season.id,
            harvestDate: harvestIso,
            shelfLifeDays: 5,
            initialQuantity: 12.5,
          })
          .expect(201);

        const body = res.body as ApiResponse<BatchSchema>;
        expect(body.success).toBe(true);
        expect(body.data.batchCode).toMatch(/^BATCH-\d{8}-/);

        await request(app.getHttpServer())
          .get(`/api/v1/batches/${body.data.id}`)
          .set(header)
          .expect(200);

        await request(app.getHttpServer())
          .get(`/api/v1/batches/${body.data.id}/qr-label`)
          .set(header)
          .expect(200);
      }
    });
  });

  describe("POST /api/v1/batches", () => {
    it("creates an in_stock batch with server-generated code, computed expirationDate, and equal stock", async () => {
      // Invariant: INV-BATCH-1, INV-BATCH-2, INV-BATCH-4, INV-BATCH-DROP-1
      const farm = await createFarm(setup.db);
      const plot = await createPlot(setup.db, { farmId: farm.id });
      const season = await createSeason(
        setup.db,
        SeasonMother.active({
          plotId: plot.id,
          startDate: "2020-01-01",
        }),
      );
      const product = await createProduct(setup.db, {
        name: "Cà chua bi hữu cơ",
        slug: "ca-chua-bi-huu-co",
        unit: "kg",
      });

      const harvestDate = new Date(Date.now() - 2 * TIME_IN_MS.HOUR);
      const shelfLifeDays = 4; // 94h left >= 48h

      const res = await request(app.getHttpServer())
        .post("/api/v1/batches")
        .set(farmStaffHeader)
        .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
        .send({
          productId: product.id,
          seasonId: season.id,
          harvestDate: harvestDate.toISOString(),
          shelfLifeDays,
          initialQuantity: 35.75,
        })
        .expect(201);

      const body = res.body as ApiResponse<BatchSchema>;
      expect(body.success).toBe(true);
      expect(body.data.batchCode).toMatch(
        /^BATCH-\d{8}-CACHUA-[0-9A-HJKMNPQRSTVWXYZ]{6}$/,
      );
      expect(body.data.initialQuantity).toBe(35.75);
      expect(body.data.availableQuantity).toBe(35.75);
      expect("qrCodeUrl" in body.data).toBe(false);
      expect(body.data.status).toBe(BatchStatus.IN_STOCK);
      expect(body.data.product).toEqual({
        id: product.id,
        name: product.name,
        slug: product.slug,
        unit: product.unit,
      });
      expect(body.data.season).toEqual({
        id: season.id,
        seasonName: season.seasonName,
        plotId: plot.id,
      });
      expect(new Date(body.data.expirationDate).getTime()).toBe(
        harvestDate.getTime() + shelfLifeDays * TIME_IN_MS.DAY,
      );

      // Verify public traceability resolves the newly minted batch with ISO timestamps
      const traceRes = await request(app.getHttpServer())
        .get(`/api/v1/trace/${body.data.batchCode}`)
        .expect(200);
      const traceBody = traceRes.body as ApiResponse<TraceRecordSchema>;
      expect(traceBody.data.batch.harvestDate).toBe(body.data.harvestDate);
      expect(traceBody.data.batch.expirationDate).toBe(
        body.data.expirationDate,
      );

      await appRedisClient
        .unlink(
          `${TRACE_CACHE_PREFIX}${body.data.batchCode}`,
          `${TRACE_MISS_CACHE_PREFIX}${body.data.batchCode}`,
          `${TRACE_INVALIDATED_AT_PREFIX}${body.data.batchCode}`,
        )
        .catch(() => undefined);
    });

    it("derives near_expiry from configured FarmSettings flashSaleConfig hoursThreshold", async () => {
      // Invariant: INV-BATCH-3
      const farm = await createFarm(setup.db, {
        flashSaleConfig: {
          hoursThreshold: 72,
          discountPercent: 50,
        },
      });
      const plot = await createPlot(setup.db, { farmId: farm.id });
      const season = await createSeason(
        setup.db,
        SeasonMother.harvested({
          plotId: plot.id,
          startDate: "2020-01-01",
        }),
      );
      const product = await createProduct(setup.db, ProductMother.inactive());

      // Harvested 10h ago with 3 days shelf life -> 62h left (< 72h custom threshold)
      const harvestDate = new Date(Date.now() - 10 * TIME_IN_MS.HOUR);

      const res = await request(app.getHttpServer())
        .post("/api/v1/batches")
        .set(farmStaffHeader)
        .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
        .send({
          productId: product.id,
          seasonId: season.id,
          harvestDate: harvestDate.toISOString(),
          shelfLifeDays: 3,
          initialQuantity: 20,
        })
        .expect(201);

      const body = res.body as ApiResponse<BatchSchema>;
      expect(body.data.status).toBe(BatchStatus.NEAR_EXPIRY);
    });

    it("enforces Idempotency-Key presence, identical replay, and payload mismatch rejection", async () => {
      // Invariant: INV-BATCH-6
      const farm = await createFarm(setup.db);
      const plot = await createPlot(setup.db, { farmId: farm.id });
      const season = await createSeason(
        setup.db,
        SeasonMother.active({ plotId: plot.id, startDate: "2020-01-01" }),
      );
      const product = await createProduct(setup.db);
      const harvestIso = new Date(Date.now() - TIME_IN_MS.HOUR).toISOString();

      await request(app.getHttpServer())
        .post("/api/v1/batches")
        .set(farmStaffHeader)
        .send({
          productId: product.id,
          seasonId: season.id,
          harvestDate: harvestIso,
          shelfLifeDays: 3,
          initialQuantity: 10,
        })
        .expect(400);

      const idempotencyKey = randomUUID();
      const payload = {
        productId: product.id,
        seasonId: season.id,
        harvestDate: harvestIso,
        shelfLifeDays: 3,
        initialQuantity: 10,
      };

      const first = await request(app.getHttpServer())
        .post("/api/v1/batches")
        .set(farmStaffHeader)
        .set(IDEMPOTENCY_HEADER_NAME, idempotencyKey)
        .send(payload)
        .expect(201);

      const replay = await request(app.getHttpServer())
        .post("/api/v1/batches")
        .set(farmStaffHeader)
        .set(IDEMPOTENCY_HEADER_NAME, idempotencyKey)
        .send(payload)
        .expect(201);

      const firstBody = first.body as ApiResponse<BatchSchema>;
      const replayBody = replay.body as ApiResponse<BatchSchema>;
      expect(replayBody.data.id).toBe(firstBody.data.id);
      expect(replayBody.data.batchCode).toBe(firstBody.data.batchCode);

      const rows = await setup.db
        .select({ id: batches.id })
        .from(batches)
        .where(eq(batches.productId, product.id));
      expect(rows).toHaveLength(1);

      const mismatchRes = await request(app.getHttpServer())
        .post("/api/v1/batches")
        .set(farmStaffHeader)
        .set(IDEMPOTENCY_HEADER_NAME, idempotencyKey)
        .send({ ...payload, initialQuantity: 99 })
        .expect(422);

      const mismatchProblem = mismatchRes.body as Rfc9457ProblemDetails;
      expect(mismatchProblem.code).toBe(API_ERROR_CODES.UNPROCESSABLE_ENTITY);
    });

    it("serializes concurrent requests sharing the same Idempotency-Key without creating duplicate batches", async () => {
      // Invariant: INV-BATCH-6
      const farm = await createFarm(setup.db);
      const plot = await createPlot(setup.db, { farmId: farm.id });
      const season = await createSeason(
        setup.db,
        SeasonMother.active({ plotId: plot.id, startDate: "2020-01-01" }),
      );
      const product = await createProduct(setup.db);
      const idempotencyKey = randomUUID();
      const payload = {
        productId: product.id,
        seasonId: season.id,
        harvestDate: new Date(Date.now() - TIME_IN_MS.HOUR).toISOString(),
        shelfLifeDays: 3,
        initialQuantity: 15,
      };

      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .post("/api/v1/batches")
          .set(farmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, idempotencyKey)
          .send(payload),
        request(app.getHttpServer())
          .post("/api/v1/batches")
          .set(farmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, idempotencyKey)
          .send(payload),
      ]);

      const statuses = [resA.status, resB.status].sort((a, b) => a - b);
      expect(
        (statuses[0] === 201 && statuses[1] === 409) ||
          (statuses[0] === 201 && statuses[1] === 201),
      ).toBe(true);

      const persisted = await setup.db
        .select({ id: batches.id })
        .from(batches)
        .where(eq(batches.productId, product.id));
      expect(persisted).toHaveLength(1);
    });

    it("evicts a pre-existing negative trace cache marker after committing batch creation", async () => {
      // Invariant: INV-BATCH-6
      const farm = await createFarm(setup.db);
      const plot = await createPlot(setup.db, { farmId: farm.id });
      const season = await createSeason(
        setup.db,
        SeasonMother.active({ plotId: plot.id, startDate: "2020-01-01" }),
      );
      const product = await createProduct(setup.db, {
        slug: "cai-bo-xoi",
      });

      const harvestDate = new Date(Date.now() - TIME_IN_MS.HOUR);
      const yyyymmdd = formatVnCompactDate(harvestDate);
      const predictedCode = `BATCH-${yyyymmdd}-CAIBOX-NEGHIT`;

      await request(app.getHttpServer())
        .get(`/api/v1/trace/${predictedCode}`)
        .expect(404);
      const missBefore = await appRedisClient.get(
        `${TRACE_MISS_CACHE_PREFIX}${predictedCode}`,
      );
      expect(missBefore).toBe("1");

      const suffixSpy = spyOn(
        BatchesService.prototype as unknown as {
          generateRandomCodeSuffix: () => string;
        },
        "generateRandomCodeSuffix",
      ).mockReturnValueOnce("NEGHIT");

      try {
        const createRes = await request(app.getHttpServer())
          .post("/api/v1/batches")
          .set(farmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            productId: product.id,
            seasonId: season.id,
            harvestDate: harvestDate.toISOString(),
            shelfLifeDays: 4,
            initialQuantity: 8,
          })
          .expect(201);

        expect(
          (createRes.body as ApiResponse<BatchSchema>).data.batchCode,
        ).toBe(predictedCode);

        const missAfter = await appRedisClient.get(
          `${TRACE_MISS_CACHE_PREFIX}${predictedCode}`,
        );
        expect(missAfter).toBeNull();

        await request(app.getHttpServer())
          .get(`/api/v1/trace/${predictedCode}`)
          .expect(200);
      } finally {
        suffixSpy.mockRestore();
        await appRedisClient
          .unlink(
            `${TRACE_CACHE_PREFIX}${predictedCode}`,
            `${TRACE_MISS_CACHE_PREFIX}${predictedCode}`,
            `${TRACE_INVALIDATED_AT_PREFIX}${predictedCode}`,
          )
          .catch(() => undefined);
      }
    });

    it("rejects client-supplied batchCode, qrCodeUrl, availableQuantity, missing timezone offset, and invalid quantities", async () => {
      // Invariant: INV-BATCH-1, INV-BATCH-4, INV-BATCH-DROP-2
      const farm = await createFarm(setup.db);
      const plot = await createPlot(setup.db, { farmId: farm.id });
      const season = await createSeason(
        setup.db,
        SeasonMother.active({ plotId: plot.id, startDate: "2020-01-01" }),
      );
      const product = await createProduct(setup.db);
      const harvestIso = new Date(Date.now() - TIME_IN_MS.HOUR).toISOString();

      const customCodeRes = await request(app.getHttpServer())
        .post("/api/v1/batches")
        .set(farmStaffHeader)
        .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
        .send({
          productId: product.id,
          seasonId: season.id,
          harvestDate: harvestIso,
          shelfLifeDays: 3,
          initialQuantity: 10,
          batchCode: "BATCH-CUSTOM-01",
        })
        .expect(400);
      expect((customCodeRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.VALIDATION_FAILED,
      );

      for (const badQrUrl of [null, "https://evil.example/trace/CUSTOM"]) {
        const clientQrUrlRes = await request(app.getHttpServer())
          .post("/api/v1/batches")
          .set(farmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            productId: product.id,
            seasonId: season.id,
            harvestDate: harvestIso,
            shelfLifeDays: 3,
            initialQuantity: 10,
            qrCodeUrl: badQrUrl,
          })
          .expect(400);
        const qrUrlProblem = clientQrUrlRes.body as Rfc9457ProblemDetails;
        expect(qrUrlProblem.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
        expect(
          qrUrlProblem.invalidParams.some(
            (param) => param.code === API_ERROR_CODES.UNRECOGNIZED_KEYS,
          ),
        ).toBe(true);
      }

      for (const badQuantity of [0, -5, 10.123]) {
        await request(app.getHttpServer())
          .post("/api/v1/batches")
          .set(farmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            productId: product.id,
            seasonId: season.id,
            harvestDate: harvestIso,
            shelfLifeDays: 3,
            initialQuantity: badQuantity,
          })
          .expect(400);
      }

      // Reject bare YYYY-MM-DD or offset-less datetime
      for (const badDate of ["2026-11-20", "2026-11-20T04:00:00"]) {
        await request(app.getHttpServer())
          .post("/api/v1/batches")
          .set(farmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            productId: product.id,
            seasonId: season.id,
            harvestDate: badDate,
            shelfLifeDays: 3,
            initialQuantity: 10,
          })
          .expect(400);
      }
    });

    it("rejects past expiration, future harvestDate, planning/completed seasons, and soft-deleted products", async () => {
      // Invariant: INV-BATCH-2, INV-BATCH-5
      const farm = await createFarm(setup.db);
      const plot = await createPlot(setup.db, { farmId: farm.id });
      const activeSeason = await createSeason(
        setup.db,
        SeasonMother.active({ plotId: plot.id, startDate: "2020-01-01" }),
      );
      const planningSeason = await createSeason(
        setup.db,
        SeasonMother.planning({ plotId: plot.id, startDate: "2020-01-01" }),
      );
      const completedSeason = await createSeason(
        setup.db,
        SeasonMother.completed({ plotId: plot.id, startDate: "2020-01-01" }),
      );
      const activeProduct = await createProduct(setup.db);
      const deletedProduct = await createProduct(
        setup.db,
        ProductMother.softDeleted(),
      );

      // Past expiry (harvested 4 days ago, 3 days shelf life)
      const expiredRes = await request(app.getHttpServer())
        .post("/api/v1/batches")
        .set(farmStaffHeader)
        .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
        .send({
          productId: activeProduct.id,
          seasonId: activeSeason.id,
          harvestDate: new Date(Date.now() - 4 * TIME_IN_MS.DAY).toISOString(),
          shelfLifeDays: 3,
          initialQuantity: 10,
        })
        .expect(422);
      expect((expiredRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.BATCH_EXPIRED_AT_INTAKE,
      );

      // Future harvest timestamp
      const futureRes = await request(app.getHttpServer())
        .post("/api/v1/batches")
        .set(farmStaffHeader)
        .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
        .send({
          productId: activeProduct.id,
          seasonId: activeSeason.id,
          harvestDate: new Date(Date.now() + TIME_IN_MS.HOUR).toISOString(),
          shelfLifeDays: 3,
          initialQuantity: 10,
        })
        .expect(422);
      expect((futureRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.BATCH_HARVEST_DATE_INVALID,
      );

      // Planning & completed seasons rejected
      for (const badSeason of [planningSeason, completedSeason]) {
        const seasonRes = await request(app.getHttpServer())
          .post("/api/v1/batches")
          .set(farmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            productId: activeProduct.id,
            seasonId: badSeason.id,
            harvestDate: new Date(Date.now() - TIME_IN_MS.HOUR).toISOString(),
            shelfLifeDays: 3,
            initialQuantity: 10,
          })
          .expect(422);
        expect((seasonRes.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.BATCH_SEASON_STATUS_INVALID,
        );
      }

      // Soft-deleted product rejected with 404
      const deletedProdRes = await request(app.getHttpServer())
        .post("/api/v1/batches")
        .set(farmStaffHeader)
        .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
        .send({
          productId: deletedProduct.id,
          seasonId: activeSeason.id,
          harvestDate: new Date(Date.now() - TIME_IN_MS.HOUR).toISOString(),
          shelfLifeDays: 3,
          initialQuantity: 10,
        })
        .expect(404);
      expect((deletedProdRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.PRODUCT_NOT_FOUND,
      );
    });

    it("compares harvestDate against season.startDate in Asia/Ho_Chi_Minh rather than UTC", async () => {
      // Invariant: INV-BATCH-5
      const farm = await createFarm(setup.db);
      const plot = await createPlot(setup.db, { farmId: farm.id });

      const yesterdayMs = Date.now() - 2 * TIME_IN_MS.DAY;
      const vnDate = formatVnCalendarDate(new Date(yesterdayMs));
      const season = await createSeason(
        setup.db,
        SeasonMother.active({
          plotId: plot.id,
          startDate: vnDate,
        }),
      );
      const product = await createProduct(setup.db);

      // 04:00+07:00 on season.startDate (21:00Z previous UTC day) must succeed
      const res = await request(app.getHttpServer())
        .post("/api/v1/batches")
        .set(farmStaffHeader)
        .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
        .send({
          productId: product.id,
          seasonId: season.id,
          harvestDate: `${vnDate}T04:00:00+07:00`,
          shelfLifeDays: 5,
          initialQuantity: 10,
        })
        .expect(201);
      expect((res.body as ApiResponse<BatchSchema>).success).toBe(true);

      // 23:59:59+07:00 on the day before season.startDate must fail
      const dayBeforeVn = formatVnCalendarDate(
        new Date(
          new Date(`${vnDate}T12:00:00+07:00`).getTime() - TIME_IN_MS.DAY,
        ),
      );
      const beforeRes = await request(app.getHttpServer())
        .post("/api/v1/batches")
        .set(farmStaffHeader)
        .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
        .send({
          productId: product.id,
          seasonId: season.id,
          harvestDate: `${dayBeforeVn}T23:59:59+07:00`,
          shelfLifeDays: 5,
          initialQuantity: 10,
        })
        .expect(422);
      expect((beforeRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.BATCH_HARVEST_DATE_INVALID,
      );
    });
  });

  describe("GET /api/v1/batches", () => {
    it("supports productId, seasonId, status, search filters, sort, pagination metadata, and strict query validation", async () => {
      // Invariant: INV-BATCH-DROP-1
      const farm = await createFarm(setup.db);
      const plot1 = await createPlot(setup.db, { farmId: farm.id });
      const plot2 = await createPlot(setup.db, { farmId: farm.id });
      const season1 = await createSeason(
        setup.db,
        SeasonMother.active({ plotId: plot1.id }),
      );
      const season2 = await createSeason(
        setup.db,
        SeasonMother.harvested({ plotId: plot2.id }),
      );
      const prod1 = await createProduct(setup.db, { name: "Cải bó xôi" });
      const prod2 = await createProduct(setup.db, { name: "Xà lách" });

      const nowMs = Date.now();
      const b1 = await createBatch(setup.db, {
        batchCode: "BATCH-FILTER-100_PCT",
        productId: prod1.id,
        seasonId: season1.id,
        harvestDate: new Date(nowMs - 3 * TIME_IN_MS.DAY),
        expirationDate: new Date(nowMs + 5 * TIME_IN_MS.DAY),
        status: BatchStatus.IN_STOCK,
      });
      const b2 = await createBatch(setup.db, {
        batchCode: "BATCH-FILTER-200",
        productId: prod2.id,
        seasonId: season2.id,
        harvestDate: new Date(nowMs - 2 * TIME_IN_MS.DAY),
        expirationDate: new Date(nowMs + TIME_IN_MS.DAY),
        status: BatchStatus.NEAR_EXPIRY,
      });
      const b3 = await createBatch(setup.db, {
        batchCode: "BATCH-FILTER-300",
        productId: prod2.id,
        seasonId: season2.id,
        harvestDate: new Date(nowMs - TIME_IN_MS.DAY),
        expirationDate: new Date(nowMs + 3 * TIME_IN_MS.DAY),
        status: BatchStatus.IN_STOCK,
      });

      const byProduct = await request(app.getHttpServer())
        .get(`/api/v1/batches?productId=${prod1.id}&status=in_stock`)
        .set(farmStaffHeader)
        .expect(200);
      const byProductBody = byProduct.body as ApiResponse<
        BatchSchema[],
        PaginationMetaSchema
      >;
      expect(byProductBody.data).toHaveLength(1);
      const [firstBatch] = byProductBody.data;
      if (!firstBatch) {
        throw new Error("Expected filtered batch item");
      }
      expect(firstBatch.id).toBe(b1.id);
      expect("qrCodeUrl" in firstBatch).toBe(false);
      expect(byProductBody.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });

      // seasonId filter + sort by expirationDate:asc + pagination page/limit
      const pagedRes = await request(app.getHttpServer())
        .get(
          `/api/v1/batches?seasonId=${season2.id}&sort=expirationDate:asc&page=1&limit=1`,
        )
        .set(farmStaffHeader)
        .expect(200);
      const pagedBody = pagedRes.body as ApiResponse<
        BatchSchema[],
        PaginationMetaSchema
      >;
      expect(pagedBody.data).toHaveLength(1);
      expect(pagedBody.data[0]?.id).toBe(b2.id);
      expect(pagedBody.meta).toEqual({
        page: 1,
        limit: 1,
        total: 2,
        totalPages: 2,
        hasNextPage: true,
        hasPrevPage: false,
      });

      const page2Res = await request(app.getHttpServer())
        .get(
          `/api/v1/batches?seasonId=${season2.id}&sort=expirationDate:asc&page=2&limit=1`,
        )
        .set(farmStaffHeader)
        .expect(200);
      const page2Body = page2Res.body as ApiResponse<
        BatchSchema[],
        PaginationMetaSchema
      >;
      expect(page2Body.data).toHaveLength(1);
      expect(page2Body.data[0]?.id).toBe(b3.id);
      expect(page2Body.meta).toEqual({
        page: 2,
        limit: 1,
        total: 2,
        totalPages: 2,
        hasNextPage: false,
        hasPrevPage: true,
      });

      // Out-of-range page retains true total count
      const outOfRangeRes = await request(app.getHttpServer())
        .get(`/api/v1/batches?seasonId=${season2.id}&page=3&limit=1`)
        .set(farmStaffHeader)
        .expect(200);
      const outOfRangeBody = outOfRangeRes.body as ApiResponse<
        BatchSchema[],
        PaginationMetaSchema
      >;
      expect(outOfRangeBody.data).toEqual([]);
      expect(outOfRangeBody.meta?.total).toBe(2);

      // Escaped wildcard search
      const bySearch = await request(app.getHttpServer())
        .get("/api/v1/batches?search=100_PCT")
        .set(farmStaffHeader)
        .expect(200);
      expect(
        (bySearch.body as ApiResponse<BatchSchema[], PaginationMetaSchema>)
          .data,
      ).toHaveLength(1);

      // Unknown query param rejected
      await request(app.getHttpServer())
        .get("/api/v1/batches?unknown=1")
        .set(farmStaffHeader)
        .expect(400);
    });
  });

  describe("GET /api/v1/batches/:id", () => {
    it("returns batch detail even after product soft-delete and rejects missing ID", async () => {
      // Invariant: INV-BATCH-DROP-1
      const product = await createProduct(setup.db);
      const batch = await createBatch(setup.db, { productId: product.id });

      await setup.db
        .update(products)
        .set({ deletedAt: new Date() })
        .where(eq(products.id, product.id));

      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/batches/${batch.id}`)
        .set(farmStaffHeader)
        .expect(200);
      const detailBody = detailRes.body as ApiResponse<BatchSchema>;
      expect(detailBody.data.product.id).toBe(product.id);
      expect("qrCodeUrl" in detailBody.data).toBe(false);

      const missingRes = await request(app.getHttpServer())
        .get(`/api/v1/batches/${UNKNOWN_UUID_V7}`)
        .set(farmStaffHeader)
        .expect(404);
      expect((missingRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.BATCH_NOT_FOUND,
      );
    });
  });

  describe("GET /api/v1/batches/:id/qr-label", () => {
    it("returns deterministic QR label payload built dynamically from configured public origin", async () => {
      // Invariant: INV-QR-LABEL-2, INV-QR-LABEL-4, INV-BATCH-DROP-3
      const product = await createProduct(setup.db, {
        name: "Rau cải ngọt hữu cơ",
        unit: "500g",
      });
      const batch = await createBatch(setup.db, {
        productId: product.id,
      });

      const originalStorefrontUrl = env.STOREFRONT_URL;
      try {
        (env as { STOREFRONT_URL: string }).STOREFRONT_URL =
          "https://greenroots.farm/";

        const firstRes = await request(app.getHttpServer())
          .get(`/api/v1/batches/${batch.id}/qr-label`)
          .set(farmStaffHeader)
          .expect(200);
        const secondRes = await request(app.getHttpServer())
          .get(`/api/v1/batches/${batch.id}/qr-label`)
          .set(adminHeader)
          .expect(200);

        expect(firstRes.headers["cache-control"]).toBe("no-cache");

        const firstBody = firstRes.body as ApiResponse<BatchQrLabelSchema>;
        const secondBody = secondRes.body as ApiResponse<BatchQrLabelSchema>;
        const expectedTraceUrl = `https://greenroots.farm/trace/${encodeURIComponent(batch.batchCode)}`;

        expect(firstBody.success).toBe(true);
        expect(firstBody.data).toEqual({
          batchCode: batch.batchCode,
          traceUrl: expectedTraceUrl,
          labelPayload: {
            batchCode: batch.batchCode,
            productName: "Rau cải ngọt hữu cơ",
            unit: "500g",
            harvestDate: batch.harvestDate.toISOString(),
            expirationDate: batch.expirationDate.toISOString(),
            qrValue: expectedTraceUrl,
          },
        });
        expect(secondBody.data).toEqual(firstBody.data);
        expect(firstBody.data.traceUrl).not.toContain("localhost");
        expect(Object.keys(firstBody.data).sort()).toEqual([
          "batchCode",
          "labelPayload",
          "traceUrl",
        ]);

        (env as { STOREFRONT_URL: string }).STOREFRONT_URL =
          "https://staging.greenroots.farm";
        const stagingRes = await request(app.getHttpServer())
          .get(`/api/v1/batches/${batch.id}/qr-label`)
          .set(farmStaffHeader)
          .expect(200);
        const stagingBody = stagingRes.body as ApiResponse<BatchQrLabelSchema>;
        const expectedStagingUrl = `https://staging.greenroots.farm/trace/${encodeURIComponent(batch.batchCode)}`;
        expect(stagingBody.data.traceUrl).toBe(expectedStagingUrl);
        expect(stagingBody.data.labelPayload.qrValue).toBe(expectedStagingUrl);
      } finally {
        (env as { STOREFRONT_URL: string }).STOREFRONT_URL =
          originalStorefrontUrl;
      }
    });

    it("returns QR label for expired, sold-out, and soft-deleted-product batches", async () => {
      // Invariant: INV-QR-LABEL-3
      const product = await createProduct(setup.db, {
        name: "Xà lách thủy canh",
        unit: "300g",
      });
      const expiredBatch = await createBatch(
        setup.db,
        BatchMother.expired({ productId: product.id }),
      );
      const soldOutBatch = await createBatch(setup.db, {
        productId: product.id,
        availableQuantity: "0.00",
        status: BatchStatus.SOLD_OUT,
      });

      await setup.db
        .update(products)
        .set({ deletedAt: new Date() })
        .where(eq(products.id, product.id));

      for (const batch of [expiredBatch, soldOutBatch]) {
        const res = await request(app.getHttpServer())
          .get(`/api/v1/batches/${batch.id}/qr-label`)
          .set(superAdminHeader)
          .expect(200);
        const body = res.body as ApiResponse<BatchQrLabelSchema>;
        expect(body.data.batchCode).toBe(batch.batchCode);
        expect(body.data.labelPayload.productName).toBe("Xà lách thủy canh");
      }
    });

    it("rejects malformed batch identifiers and returns not-found for missing batches", async () => {
      // Invariant: INV-QR-LABEL-3
      for (const invalidId of [
        "not-a-uuid",
        "550e8400-e29b-41d4-a716-446655440000", // UUIDv4
      ]) {
        const invalidRes = await request(app.getHttpServer())
          .get(`/api/v1/batches/${invalidId}/qr-label`)
          .set(farmStaffHeader)
          .expect(400);
        const invalidBody = invalidRes.body as Rfc9457ProblemDetails;
        expect(invalidBody.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
        expect(invalidBody.invalidParams.length).toBeGreaterThan(0);
      }

      const missingRes = await request(app.getHttpServer())
        .get(`/api/v1/batches/${UNKNOWN_UUID_V7}/qr-label`)
        .set(farmStaffHeader)
        .expect(404);
      expect((missingRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.BATCH_NOT_FOUND,
      );
    });
  });

  describe("Database CHECK Constraints", () => {
    it("enforces positive initial_quantity, available <= initial, and expiration > harvest at PostgreSQL level", async () => {
      // Invariant: INV-BATCH-2, INV-BATCH-4
      const season = await createSeason(setup.db, SeasonMother.active());
      const product = await createProduct(setup.db);
      const now = new Date();
      const later = new Date(now.getTime() + TIME_IN_MS.DAY);

      const cases: {
        batchCode: string;
        harvestDate: Date;
        expirationDate: Date;
        initialQuantity: string;
        availableQuantity: string;
      }[] = [
        {
          batchCode: "BATCH-CHK-ZERO",
          harvestDate: now,
          expirationDate: later,
          initialQuantity: "0.00",
          availableQuantity: "0.00",
        },
        {
          batchCode: "BATCH-CHK-OVER",
          harvestDate: now,
          expirationDate: later,
          initialQuantity: "10.00",
          availableQuantity: "12.00",
        },
        {
          batchCode: "BATCH-CHK-DATE",
          harvestDate: later,
          expirationDate: now,
          initialQuantity: "10.00",
          availableQuantity: "10.00",
        },
      ];

      for (const row of cases) {
        try {
          await setup.db.insert(batches).values({
            ...row,
            seasonId: season.id,
            productId: product.id,
            status: BatchStatus.IN_STOCK,
          });
          expect.unreachable("Expected PG check_violation 23514");
        } catch (error) {
          const details = extractDatabaseErrorDetails(error);
          expect(details.isDatabaseError).toBe(true);
          expect(details.code).toBe(PG_ERROR_CODE.CHECK_VIOLATION);
        }
      }
    });

    it("rejects inconsistent flash-sale state via batches_flash_sale_state_consistent CHECK constraint", async () => {
      const farm = await createFarm(setup.db);
      const plot = await createPlot(setup.db, { farmId: farm.id });
      const season = await createSeason(
        setup.db,
        SeasonMother.active({ plotId: plot.id }),
      );
      const product = await createProduct(setup.db);
      const now = new Date();
      const later = new Date(now.getTime() + 24 * TIME_IN_MS.HOUR);

      try {
        await setup.db.insert(batches).values({
          batchCode: "BATCH-CHK-FS1",
          seasonId: season.id,
          productId: product.id,
          harvestDate: now,
          expirationDate: later,
          initialQuantity: "10.00",
          availableQuantity: "0.00",
          status: BatchStatus.SOLD_OUT,
          isFlashSale: true,
          flashSaleDiscountPercent: 50,
        });
        expect.unreachable("Expected PG check_violation 23514");
      } catch (error) {
        const details = extractDatabaseErrorDetails(error);
        expect(details.isDatabaseError).toBe(true);
        expect(details.code).toBe(PG_ERROR_CODE.CHECK_VIOLATION);
      }
    });
  });

  describe("GET /api/v1/inventory/near-expiry", () => {
    it("enforces staff RBAC and returns FEFO-ordered near-expiry batches including un-swept in_stock rows", async () => {
      await request(app.getHttpServer())
        .get("/api/v1/inventory/near-expiry")
        .expect(401);

      await request(app.getHttpServer())
        .get("/api/v1/inventory/near-expiry")
        .set(customerHeader)
        .expect(403);

      const farm = await createFarm(setup.db);
      const plot = await createPlot(setup.db, { farmId: farm.id });
      const season = await createSeason(
        setup.db,
        SeasonMother.active({ plotId: plot.id }),
      );
      const product = await createProduct(setup.db, {
        basePrice: 100_000,
        salePrice: 80_000,
      });

      const nowMs = Date.now();
      const exp12h = new Date(nowMs + 12 * TIME_IN_MS.HOUR);
      const exp30h = new Date(nowMs + 30 * TIME_IN_MS.HOUR);
      const exp72h = new Date(nowMs + 72 * TIME_IN_MS.HOUR);
      const expired = new Date(nowMs - TIME_IN_MS.HOUR);

      const nearBatch = await createBatch(setup.db, {
        productId: product.id,
        seasonId: season.id,
        expirationDate: exp30h,
        status: BatchStatus.NEAR_EXPIRY,
        isFlashSale: true,
        flashSaleDiscountPercent: 40,
      });
      const unsweptNearBatch = await createBatch(setup.db, {
        productId: product.id,
        seasonId: season.id,
        expirationDate: exp12h,
        status: BatchStatus.IN_STOCK,
      });
      // Outside 48h threshold
      await createBatch(setup.db, {
        productId: product.id,
        seasonId: season.id,
        expirationDate: exp72h,
        status: BatchStatus.IN_STOCK,
      });
      // Already expired
      await createBatch(setup.db, {
        productId: product.id,
        seasonId: season.id,
        expirationDate: expired,
        status: BatchStatus.EXPIRED,
      });

      const res = await request(app.getHttpServer())
        .get("/api/v1/inventory/near-expiry")
        .set(farmStaffHeader)
        .expect(200);

      const body = res.body as ApiResponse<
        NearExpiryBatchSchema[],
        PaginationMetaSchema
      >;
      expect(body.data).toHaveLength(2);
      expect(body.data[0]?.id).toBe(unsweptNearBatch.id);
      expect(body.data[0]?.effectiveDiscountPercent).toBe(50);
      expect(body.data[0]?.rescuePriceVnd).toBe(50_000);
      expect(body.data[1]?.id).toBe(nearBatch.id);
      expect(body.data[1]?.effectiveDiscountPercent).toBe(40);
      expect(body.data[1]?.rescuePriceVnd).toBe(60_000);
      expect(body.meta?.total).toBe(2);
    });
  });

  describe("PATCH /api/v1/batches/:id/flash-sale", () => {
    it("enforces SALES/ADMIN/SUPER_ADMIN RBAC and toggles flash sale without mutating products.sale_price", async () => {
      const farm = await createFarm(setup.db);
      const plot = await createPlot(setup.db, { farmId: farm.id });
      const season = await createSeason(
        setup.db,
        SeasonMother.active({ plotId: plot.id }),
      );
      const product = await createProduct(setup.db, {
        basePrice: 100_000,
        salePrice: 80_000,
      });
      const batch = await createBatch(setup.db, {
        productId: product.id,
        seasonId: season.id,
        expirationDate: new Date(Date.now() + 24 * TIME_IN_MS.HOUR),
        status: BatchStatus.IN_STOCK,
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/batches/${batch.id}/flash-sale`)
        .set(farmStaffHeader)
        .send({ enabled: true })
        .expect(403);

      const enableRes = await request(app.getHttpServer())
        .patch(`/api/v1/batches/${batch.id}/flash-sale`)
        .set(salesHeader)
        .send({ enabled: true, discountPercent: 45 })
        .expect(200);

      const enabled = (enableRes.body as ApiResponse<BatchSchema>).data;
      expect(enabled.isFlashSale).toBe(true);
      expect(enabled.flashSaleDiscountPercent).toBe(45);
      expect(enabled.status).toBe(BatchStatus.NEAR_EXPIRY);

      const [productRow] = await setup.db
        .select({ salePrice: products.salePrice })
        .from(products)
        .where(eq(products.id, product.id));
      expect(productRow?.salePrice).toBe(80_000);

      await request(app.getHttpServer())
        .patch(`/api/v1/batches/${batch.id}/flash-sale`)
        .set(adminHeader)
        .send({ enabled: false, discountPercent: 30 })
        .expect(400);

      const disableRes = await request(app.getHttpServer())
        .patch(`/api/v1/batches/${batch.id}/flash-sale`)
        .set(superAdminHeader)
        .send({ enabled: false })
        .expect(200);

      const disabled = (disableRes.body as ApiResponse<BatchSchema>).data;
      expect(disabled.isFlashSale).toBe(false);
      expect(disabled.flashSaleDiscountPercent).toBeNull();
    });

    it("rejects enabling flash sale on ineligible batches", async () => {
      const farm = await createFarm(setup.db);
      const plot = await createPlot(setup.db, { farmId: farm.id });
      const season = await createSeason(
        setup.db,
        SeasonMother.active({ plotId: plot.id }),
      );
      const product = await createProduct(setup.db);
      const freshBatch = await createBatch(setup.db, {
        productId: product.id,
        seasonId: season.id,
        expirationDate: new Date(Date.now() + 72 * TIME_IN_MS.HOUR),
        status: BatchStatus.IN_STOCK,
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/batches/${freshBatch.id}/flash-sale`)
        .set(salesHeader)
        .send({ enabled: true })
        .expect(422);

      expect((res.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.BATCH_FLASH_SALE_NOT_ELIGIBLE,
      );
    });
  });
});
