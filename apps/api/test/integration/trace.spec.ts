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
import {
  API_ERROR_CODES,
  BatchStatus,
  FarmingActionType,
  SeasonStatus,
  UserRole,
} from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";
import { RedisService } from "@/common/services/redis.service";
import type { ApiResponse } from "@/common/utils/api-response.util";
import { categories, farmingLogs, plots, products } from "@/database/schemas";
import {
  FARM_SETTINGS_CACHE_KEY,
  FARM_SETTINGS_INVALIDATED_AT_KEY,
  TRACE_CACHE_PREFIX,
  TRACE_FARM_VERSION_KEY,
  TRACE_INVALIDATED_AT_PREFIX,
  TRACE_MISS_CACHE_PREFIX,
} from "@/modules/farms/farms.constant";
import { TraceCacheService } from "@/modules/farms/trace-cache.service";
import {
  BatchMother,
  createBatch,
  createFarm,
  createFarmingLog,
  createPlot,
  createSeason,
  FarmingLogMother,
  PlotMother,
  SeasonMother,
} from "../factories";
import type { components } from "../generated/api-schema";
import {
  cleanScopedRedisKeys,
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "../helpers/app.helper";
import { createAuthenticatedAdmin } from "../helpers/auth.helper";

type TraceRecordSchema = components["schemas"]["TraceRecordDto"];

const TEST_BATCH_CODES = [
  "BATCH-2026-TOM-01",
  "BATCH-2026-NULL-01",
  "BATCH-2026-HIST-01",
  "BATCH-2026-EXP-01",
  "BATCH-2026-CAP-01",
  "BATCH-UNKNOWN-999",
  "BATCH-2026-INV-01",
  "BATCH-2026-RACE-01",
  "BATCH-2026-CONC-01",
] as const;

async function cleanTraceRedisKeys(
  redis: ReturnType<RedisService["getClient"]>,
): Promise<void> {
  const keysToUnlink = [
    ...TEST_BATCH_CODES.flatMap((code) => [
      `${TRACE_CACHE_PREFIX}${code}`,
      `${TRACE_MISS_CACHE_PREFIX}${code}`,
      `${TRACE_INVALIDATED_AT_PREFIX}${code}`,
    ]),
    TRACE_FARM_VERSION_KEY,
    FARM_SETTINGS_CACHE_KEY,
    FARM_SETTINGS_INVALIDATED_AT_KEY,
  ];

  await redis.unlink(...keysToUnlink).catch(() => undefined);
}

describe("Traceability Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let jwtService: JwtService;
  let appRedisClient: ReturnType<RedisService["getClient"]>;
  const activeCloudName = env.CLOUDINARY_CLOUD_NAME;

  let farmStaffHeader: { Authorization: string };
  let farmStaffUserId: string;
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
    await cleanTraceRedisKeys(appRedisClient);

    const [farmStaffSession, superAdminSession] = await Promise.all([
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.FARM_STAFF),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.SUPER_ADMIN),
    ]);

    farmStaffHeader = farmStaffSession.authHeader;
    farmStaffUserId = farmStaffSession.user.id;
    superAdminHeader = superAdminSession.authHeader;
  });

  afterAll(async () => {
    await cleanTraceRedisKeys(appRedisClient);
    await teardownTestApp(setup);
  });

  describe("GET /api/v1/trace/:batchCode", () => {
    // Invariant: INV-TRACE-1
    it("returns redacted public provenance record without authentication and omits internal inventory and staff IDs", async () => {
      const farm = await createFarm(setup.db, {
        certificationUrl: `https://res.cloudinary.com/${activeCloudName}/image/upload/v1/farms/vietgap.png`,
      });
      const plot = await createPlot(
        setup.db,
        PlotMother.withLabTests({ farmId: farm.id }),
      );
      const season = await createSeason(
        setup.db,
        SeasonMother.harvested({ plotId: plot.id }),
      );
      const [category] = await setup.db
        .insert(categories)
        .values({ name: "Rau ăn quả", slug: "rau-an-qua" })
        .returning();
      const [product] = await setup.db
        .insert(products)
        .values({
          categoryId: category!.id,
          name: "Cà chua bi hữu cơ",
          slug: "ca-chua-bi-huu-co",
          basePrice: 45000,
          unit: "kg",
          imageUrls: [
            `https://res.cloudinary.com/${activeCloudName}/image/upload/v1/products/tomato.webp`,
          ],
        })
        .returning();
      const batch = await createBatch(setup.db, {
        ...BatchMother.inStock(),
        batchCode: "BATCH-2026-TOM-01",
        seasonId: season.id,
        productId: product!.id,
      });

      const seedingLog = await createFarmingLog(setup.db, {
        seasonId: season.id,
        staffId: farmStaffUserId,
        actionType: FarmingActionType.SEEDING,
        description: "Xuống giống nhà kính A1",
      });
      await createFarmingLog(
        setup.db,
        FarmingLogMother.correction(seedingLog.id, {
          seasonId: season.id,
          staffId: farmStaffUserId,
          description: "Đính chính mật độ gieo",
        }),
      );

      const startedAt = Date.now();
      const res = await request(app.getHttpServer())
        .get("/api/v1/trace/%20batch-2026-tom-01%20")
        .expect(200);
      const durationMs = Date.now() - startedAt;

      expect(durationMs).toBeLessThan(1500);
      expect(res.headers["cache-control"]).toBe("no-cache");

      const body = res.body as ApiResponse<TraceRecordSchema>;
      expect(body.success).toBe(true);
      expect(body.data.batch).toEqual({
        id: batch.id,
        batchCode: "BATCH-2026-TOM-01",
        harvestDate: batch.harvestDate.toISOString(),
        expirationDate: batch.expirationDate.toISOString(),
        status: BatchStatus.IN_STOCK,
      });
      expect(body.data.product.unit).toBe("kg");
      expect(body.data.farm.certificationUrl).toBe(farm.certificationUrl);
      expect(body.data.plot.soilTestResult?.ph).toBe(6.5);
      expect(body.data.plot.waterTestResult?.ph).toBe(7.0);
      expect(body.data.totalLogCount).toBe(2);
      expect(body.data.logsTruncated).toBe(false);
      expect(body.data.farmingLogs).toHaveLength(2);
      expect(body.data.farmingLogs[0]?.correctedBy).toHaveLength(1);
      expect(body.data.farmingLogs[1]?.correctsLog?.id).toBe(seedingLog.id);

      const batchRecord = body.data.batch as Record<string, unknown>;
      const farmRecord = body.data.farm as Record<string, unknown>;
      const logRecord = body.data.farmingLogs[0] as Record<string, unknown>;
      expect(batchRecord["initialQuantity"]).toBeUndefined();
      expect(batchRecord["availableQuantity"]).toBeUndefined();
      expect(farmRecord["bankInfo"]).toBeUndefined();
      expect(farmRecord["emails"]).toBeUndefined();
      expect(logRecord["staffId"]).toBeUndefined();
    });

    // Invariant: INV-TRACE-2
    it("preserves null laboratory telemetry and certification URL when unset on plot and farm", async () => {
      const farm = await createFarm(setup.db, { certificationUrl: null });
      const plot = await createPlot(setup.db, {
        farmId: farm.id,
        soilTestResult: null,
        waterTestResult: null,
      });
      const season = await createSeason(
        setup.db,
        SeasonMother.active({ plotId: plot.id }),
      );
      const batch = await createBatch(setup.db, {
        ...BatchMother.nearExpiry(),
        batchCode: "BATCH-2026-NULL-01",
        seasonId: season.id,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trace/${batch.batchCode}`)
        .expect(200);

      const body = res.body as ApiResponse<TraceRecordSchema>;
      expect(body.data.farm.certificationUrl).toBeNull();
      expect(body.data.plot.soilTestResult).toBeNull();
      expect(body.data.plot.waterTestResult).toBeNull();
      expect(body.data.farmingLogs).toEqual([]);
      expect(body.data.totalLogCount).toBe(0);
      expect(body.data.logsTruncated).toBe(false);
    });

    // Invariant: INV-TRACE-3
    it("resolves historical traceability even after linked plot and product are soft-deleted and batch is sold out", async () => {
      const farm = await createFarm(setup.db);
      const plot = await createPlot(setup.db, { farmId: farm.id });
      const season = await createSeason(
        setup.db,
        SeasonMother.completed({ plotId: plot.id }),
      );
      const batch = await createBatch(setup.db, {
        ...BatchMother.soldOut(),
        batchCode: "BATCH-2026-HIST-01",
        seasonId: season.id,
      });

      const now = new Date();
      await setup.db
        .update(plots)
        .set({ deletedAt: now })
        .where(eq(plots.id, plot.id));
      await setup.db
        .update(products)
        .set({ deletedAt: now })
        .where(eq(products.id, batch.productId));

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trace/${batch.batchCode}`)
        .expect(200);

      const body = res.body as ApiResponse<TraceRecordSchema>;
      expect(body.data.batch.status).toBe(BatchStatus.SOLD_OUT);
      expect(body.data.plot.plotCode).toBe(plot.plotCode);

      const expiredBatch = await createBatch(setup.db, {
        ...BatchMother.expired(),
        batchCode: "BATCH-2026-EXP-01",
        seasonId: season.id,
        productId: batch.productId,
      });

      const expiredRes = await request(app.getHttpServer())
        .get(`/api/v1/trace/${expiredBatch.batchCode}`)
        .expect(200);
      expect(
        (expiredRes.body as ApiResponse<TraceRecordSchema>).data.batch.status,
      ).toBe(BatchStatus.EXPIRED);
    });

    // Invariant: INV-TRACE-4
    it("truncates timelines exceeding 200 entries to the latest 200 chronological logs while keeping correction linkage", async () => {
      const farm = await createFarm(setup.db);
      const plot = await createPlot(setup.db, { farmId: farm.id });
      const season = await createSeason(
        setup.db,
        SeasonMother.harvested({ plotId: plot.id }),
      );
      const batch = await createBatch(setup.db, {
        batchCode: "BATCH-2026-CAP-01",
        seasonId: season.id,
      });

      const baseMs = Date.parse("2026-09-01T00:00:00.000Z");
      const values = Array.from({ length: 204 }, (_, idx) => ({
        seasonId: season.id,
        staffId: farmStaffUserId,
        actionType: FarmingActionType.WATERING,
        description: `Log entry #${idx + 1}`,
        loggedAt: new Date(baseMs + idx * 60_000),
      }));
      const inserted = await setup.db
        .insert(farmingLogs)
        .values(values)
        .returning({ id: farmingLogs.id });

      const firstLogId = inserted[0]!.id;
      await setup.db.insert(farmingLogs).values({
        seasonId: season.id,
        staffId: farmStaffUserId,
        actionType: FarmingActionType.CORRECTION,
        description: "Final correction targeting earliest log",
        correctsLogId: firstLogId,
        loggedAt: new Date(baseMs + 205 * 60_000),
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/trace/${batch.batchCode}`)
        .expect(200);

      const body = res.body as ApiResponse<TraceRecordSchema>;
      expect(body.data.totalLogCount).toBe(205);
      expect(body.data.logsTruncated).toBe(true);
      expect(body.data.farmingLogs).toHaveLength(200);
      expect(body.data.farmingLogs[0]?.description).toBe("Log entry #6");
      const lastEntry = body.data.farmingLogs[199];
      expect(lastEntry?.description).toBe(
        "Final correction targeting earliest log",
      );
      expect(lastEntry?.correctsLog?.id).toBe(firstLogId);
    });

    it("rejects malformed batch code syntax and writes 30-second negative cache for missing valid codes", async () => {
      for (const invalidPath of [
        "ab",
        "A".repeat(101),
        encodeURIComponent("../etc"),
      ]) {
        const badRes = await request(app.getHttpServer())
          .get(`/api/v1/trace/${invalidPath}`)
          .expect(400);
        expect((badRes.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.VALIDATION_FAILED,
        );
      }

      // Invariant: INV-TRACE-6
      const missRes = await request(app.getHttpServer())
        .get("/api/v1/trace/BATCH-UNKNOWN-999")
        .expect(404);
      expect((missRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.BATCH_NOT_FOUND,
      );

      const missKey = await appRedisClient.get(
        `${TRACE_MISS_CACHE_PREFIX}BATCH-UNKNOWN-999`,
      );
      expect(missKey).toBe("1");

      const secondMissRes = await request(app.getHttpServer())
        .get("/api/v1/trace/BATCH-UNKNOWN-999")
        .expect(404);
      expect((secondMissRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.BATCH_NOT_FOUND,
      );
    });

    // Invariant: INV-TRACE-5
    it("invalidates cached batch traces immediately after post-harvest correction logs, plot updates, and farm settings updates", async () => {
      const farm = await createFarm(setup.db, {
        certificationUrl: `https://res.cloudinary.com/${activeCloudName}/image/upload/v1/farms/cert-v1.png`,
      });
      const plot = await createPlot(setup.db, { farmId: farm.id });
      const season = await createSeason(
        setup.db,
        SeasonMother.harvested({ plotId: plot.id }),
      );
      const batch = await createBatch(setup.db, {
        batchCode: "BATCH-2026-INV-01",
        seasonId: season.id,
      });

      // Warm positive Redis cache.
      await request(app.getHttpServer())
        .get(`/api/v1/trace/${batch.batchCode}`)
        .expect(200);
      expect(
        await appRedisClient.get(`${TRACE_CACHE_PREFIX}${batch.batchCode}`),
      ).not.toBeNull();

      // 1. Appending a correction log on a harvested season invalidates the cached trace.
      await request(app.getHttpServer())
        .post(`/api/v1/seasons/${season.id}/logs`)
        .set(farmStaffHeader)
        .send({
          actionType: FarmingActionType.CORRECTION,
          description: "Đính chính sau thu hoạch",
        })
        .expect(201);

      const afterLogRes = await request(app.getHttpServer())
        .get(`/api/v1/trace/${batch.batchCode}`)
        .expect(200);
      expect(
        (afterLogRes.body as ApiResponse<TraceRecordSchema>).data.farmingLogs,
      ).toHaveLength(1);

      // 2. Updating plot test telemetry invalidates the cached trace.
      await request(app.getHttpServer())
        .patch(`/api/v1/plots/${plot.id}`)
        .set(farmStaffHeader)
        .send({ name: "Lô A1 - Cập nhật" })
        .expect(200);

      const afterPlotRes = await request(app.getHttpServer())
        .get(`/api/v1/trace/${batch.batchCode}`)
        .expect(200);
      expect(
        (afterPlotRes.body as ApiResponse<TraceRecordSchema>).data.plot.name,
      ).toBe("Lô A1 - Cập nhật");

      // 3. Updating farm certification rotates farm_ver epoch in O(1).
      const newCertUrl = `https://res.cloudinary.com/${activeCloudName}/image/upload/v1/farms/cert-v2.png`;
      await request(app.getHttpServer())
        .patch("/api/v1/farms/settings")
        .set(superAdminHeader)
        .send({ certificationUrl: newCertUrl })
        .expect(200);

      const afterFarmRes = await request(app.getHttpServer())
        .get(`/api/v1/trace/${batch.batchCode}`)
        .expect(200);
      expect(
        (afterFarmRes.body as ApiResponse<TraceRecordSchema>).data.farm
          .certificationUrl,
      ).toBe(newCertUrl);

      // 4. Transitioning season harvested -> completed invalidates the cached trace.
      await request(app.getHttpServer())
        .patch(`/api/v1/seasons/${season.id}`)
        .set(farmStaffHeader)
        .send({ status: SeasonStatus.COMPLETED })
        .expect(200);

      const afterSeasonRes = await request(app.getHttpServer())
        .get(`/api/v1/trace/${batch.batchCode}`)
        .expect(200);
      expect(
        (afterSeasonRes.body as ApiResponse<TraceRecordSchema>).data.season
          .status,
      ).toBe(SeasonStatus.COMPLETED);

      // 5. Post-close correction on completed season invalidates the cached trace.
      await request(app.getHttpServer())
        .post(`/api/v1/seasons/${season.id}/logs`)
        .set(farmStaffHeader)
        .send({
          actionType: FarmingActionType.CORRECTION,
          description: "Đính chính sau khi đóng mùa vụ",
        })
        .expect(201);

      const afterClosedCorrectionRes = await request(app.getHttpServer())
        .get(`/api/v1/trace/${batch.batchCode}`)
        .expect(200);
      expect(
        (afterClosedCorrectionRes.body as ApiResponse<TraceRecordSchema>).data
          .farmingLogs,
      ).toHaveLength(2);
    });

    it("blocks stale Lua cache backfill after concurrent invalidation and recovers after farm epoch eviction", async () => {
      const farm = await createFarm(setup.db, {
        certificationUrl: `https://res.cloudinary.com/${activeCloudName}/image/upload/v1/farms/cert-a.png`,
      });
      const plot = await createPlot(setup.db, { farmId: farm.id });
      const season = await createSeason(
        setup.db,
        SeasonMother.harvested({ plotId: plot.id }),
      );
      const batch = await createBatch(setup.db, {
        batchCode: "BATCH-2026-RACE-01",
        seasonId: season.id,
      });

      const initialRes = await request(app.getHttpServer())
        .get(`/api/v1/trace/${batch.batchCode}`)
        .expect(200);
      const initialData = (initialRes.body as ApiResponse<TraceRecordSchema>)
        .data;

      // Simulate invalidation at T2 while an older read started at T1 < T2.
      const traceCache = app.get(TraceCacheService);
      const staleReadStartedAt = Date.now() - 5000;
      await traceCache.invalidateByBatchCodes([batch.batchCode]);
      await traceCache.backfillTrace(
        batch.batchCode,
        "stale-ver",
        initialData,
        staleReadStartedAt,
      );
      expect(
        await appRedisClient.get(`${TRACE_CACHE_PREFIX}${batch.batchCode}`),
      ).toBeNull();

      // Re-warm cache, evict trace:farm_ver:v1, then rotate via PATCH /farms/settings.
      await request(app.getHttpServer())
        .get(`/api/v1/trace/${batch.batchCode}`)
        .expect(200);
      await appRedisClient.unlink(TRACE_FARM_VERSION_KEY);

      const rotatedCertUrl = `https://res.cloudinary.com/${activeCloudName}/image/upload/v1/farms/cert-b.png`;
      await request(app.getHttpServer())
        .patch("/api/v1/farms/settings")
        .set(superAdminHeader)
        .send({ certificationUrl: rotatedCertUrl })
        .expect(200);

      const refreshedRes = await request(app.getHttpServer())
        .get(`/api/v1/trace/${batch.batchCode}`)
        .expect(200);
      expect(
        (refreshedRes.body as ApiResponse<TraceRecordSchema>).data.farm
          .certificationUrl,
      ).toBe(rotatedCertUrl);

      const newFarmVer = await appRedisClient.get(TRACE_FARM_VERSION_KEY);
      const rewarmedRaw = await appRedisClient.get(
        `${TRACE_CACHE_PREFIX}${batch.batchCode}`,
      );
      expect(newFarmVer).not.toBeNull();
      expect(rewarmedRaw?.startsWith(`${newFarmVer}|`)).toBe(true);

      const selectSpy = spyOn(setup.db, "select");
      await request(app.getHttpServer())
        .get(`/api/v1/trace/${batch.batchCode}`)
        .expect(200);
      expect(selectSpy).not.toHaveBeenCalled();
      selectSpy.mockRestore();
    });

    it("coalesces concurrent cache-miss requests and fails open when Redis is unreachable", async () => {
      const farm = await createFarm(setup.db);
      const plot = await createPlot(setup.db, { farmId: farm.id });
      const season = await createSeason(
        setup.db,
        SeasonMother.active({ plotId: plot.id }),
      );
      const batch = await createBatch(setup.db, {
        batchCode: "BATCH-2026-CONC-01",
        seasonId: season.id,
      });

      const selectSpy = spyOn(setup.db, "select");

      const concurrentResponses = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(app.getHttpServer()).get(`/api/v1/trace/${batch.batchCode}`),
        ),
      );
      for (const response of concurrentResponses) {
        expect(response.status).toBe(200);
      }
      expect(selectSpy).toHaveBeenCalledTimes(2);
      selectSpy.mockRestore();

      // Invariant: INV-TRACE-6
      const mgetSpy = spyOn(appRedisClient, "mget").mockRejectedValueOnce(
        new Error("Redis temporarily unavailable"),
      );
      const fallbackRes = await request(app.getHttpServer())
        .get(`/api/v1/trace/${batch.batchCode}`)
        .expect(200);
      expect(
        (fallbackRes.body as ApiResponse<TraceRecordSchema>).data.batch
          .batchCode,
      ).toBe(batch.batchCode);
      mgetSpy.mockRestore();
    });
  });
});
