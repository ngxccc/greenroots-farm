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
import { type INestApplication, type ArgumentsHost } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { eq, sql } from "drizzle-orm";
import {
  API_ERROR_CODES,
  FarmingActionType,
  SeasonStatus,
  UserRole,
} from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import {
  GlobalExceptionFilter,
  type Rfc9457ProblemDetails,
} from "@/common/filters/global-exception.filter";
import type { ApiResponse } from "@/common/utils/api-response.util";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";
import { farmingLogs } from "@/database/schemas";
import {
  createFarm,
  createFarmingLog,
  createPlot,
  createSeason,
  FarmingLogMother,
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

type FarmingLogSchema = components["schemas"]["FarmingLogDto"];
type PaginationMetaSchema = components["schemas"]["PaginationMetaDto"];

const UNKNOWN_UUID_V7 = "019fa8bc-8f4d-7000-b366-e691f45cffff";

describe("Farming Logs Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let jwtService: JwtService;
  const activeCloudName = env.CLOUDINARY_CLOUD_NAME;

  let customerHeader: { Authorization: string };
  let guestHeader: { Authorization: string };
  let salesHeader: { Authorization: string };
  let farmStaffHeader: { Authorization: string };
  let farmStaffUserId: string;
  let adminHeader: { Authorization: string };
  let superAdminHeader: { Authorization: string };

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    jwtService = app.get(JwtService);
  }, 30000);

  beforeEach(async () => {
    await setup.db.execute(
      sql`TRUNCATE TABLE "farming_logs", "batches", "products", "categories", "seasons", "plots", "farms", "users" CASCADE;`,
    );
    await cleanScopedRedisKeys(setup.redisClient);

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
    farmStaffUserId = farmStaffSession.user.id;
    adminHeader = adminSession.authHeader;
    superAdminHeader = superAdminSession.authHeader;
  });

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  describe("RBAC Matrix", () => {
    it("forbids unauthenticated, guest, customer, and sales callers on farming log routes", async () => {
      const season = await createSeason(setup.db, SeasonMother.active());

      await request(app.getHttpServer())
        .get(`/api/v1/seasons/${season.id}/logs`)
        .expect(401);

      await request(app.getHttpServer())
        .post(`/api/v1/seasons/${season.id}/logs`)
        .send({
          actionType: FarmingActionType.WATERING,
          description: "Tưới buổi sáng",
        })
        .expect(401);

      for (const header of [guestHeader, customerHeader, salesHeader]) {
        await request(app.getHttpServer())
          .get(`/api/v1/seasons/${season.id}/logs`)
          .set(header)
          .expect(403);

        await request(app.getHttpServer())
          .post(`/api/v1/seasons/${season.id}/logs`)
          .set(header)
          .send({
            actionType: FarmingActionType.WATERING,
            description: "Tưới buổi sáng",
          })
          .expect(403);
      }

      for (const header of [farmStaffHeader, adminHeader, superAdminHeader]) {
        await request(app.getHttpServer())
          .get(`/api/v1/seasons/${season.id}/logs`)
          .set(header)
          .expect(200);
      }
    });
  });

  describe("POST /api/v1/seasons/:id/logs", () => {
    // Invariant: INV-FLOG-4, INV-FLOG-5
    it("creates an append-only log with validated actionType, image/video mediaUrls, and server attribution", async () => {
      const season = await createSeason(setup.db, SeasonMother.active());
      const imageUrl = `https://res.cloudinary.com/${activeCloudName}/image/upload/v1700000001/farming_logs/watering-1.webp`;
      const videoUrl = `https://res.cloudinary.com/${activeCloudName}/video/upload/v1700000002/farming_logs/watering-clip.mp4`;

      const response = await request(app.getHttpServer())
        .post(`/api/v1/seasons/${season.id}/logs`)
        .set(farmStaffHeader)
        .send({
          actionType: FarmingActionType.WATERING,
          description: "  <script>alert(1)</script> Tưới nhỏ giọt   lô A1  ",
          mediaUrls: [imageUrl, videoUrl],
        })
        .expect(201);

      const body = response.body as ApiResponse<FarmingLogSchema>;
      expect(body.success).toBe(true);
      expect(body.data.seasonId).toBe(season.id);
      expect(body.data.staffId).toBe(farmStaffUserId);
      expect(body.data.staff.id).toBe(farmStaffUserId);
      expect(body.data.actionType).toBe(FarmingActionType.WATERING);
      expect(body.data.description).toBe("Tưới nhỏ giọt lô A1");
      expect(body.data.mediaUrls).toEqual([imageUrl, videoUrl]);
      expect(body.data.correctsLogId).toBeNull();
      expect(body.data.correctsLog).toBeNull();
      expect(body.data.correctedBy).toEqual([]);
      expect(new Date(body.data.loggedAt).toString()).not.toBe("Invalid Date");
    });

    // Invariant: INV-FLOG-2, INV-FLOG-6
    it("links correction logs within the same season and supports correction chains", async () => {
      const season = await createSeason(setup.db, SeasonMother.active());
      const original = await createFarmingLog(
        setup.db,
        FarmingLogMother.watering({
          seasonId: season.id,
          staffId: farmStaffUserId,
          description: "Tưới 100 lít nước",
        }),
      );

      const firstCorrectionRes = await request(app.getHttpServer())
        .post(`/api/v1/seasons/${season.id}/logs`)
        .set(farmStaffHeader)
        .send({
          actionType: FarmingActionType.CORRECTION,
          description: "Đính chính: thực tế tưới 120 lít",
          correctsLogId: original.id,
        })
        .expect(201);

      const firstCorrection = (
        firstCorrectionRes.body as ApiResponse<FarmingLogSchema>
      ).data;
      expect(firstCorrection.correctsLogId).toBe(original.id);
      expect(firstCorrection.correctsLog).toMatchObject({
        id: original.id,
        actionType: FarmingActionType.WATERING,
        description: "Tưới 100 lít nước",
      });

      const secondCorrectionRes = await request(app.getHttpServer())
        .post(`/api/v1/seasons/${season.id}/logs`)
        .set(adminHeader)
        .send({
          actionType: FarmingActionType.CORRECTION,
          description: "Đính chính bổ sung: thực tế 125 lít",
          correctsLogId: firstCorrection.id,
        })
        .expect(201);

      const secondCorrection = (
        secondCorrectionRes.body as ApiResponse<FarmingLogSchema>
      ).data;
      expect(secondCorrection.correctsLogId).toBe(firstCorrection.id);

      const parallelCorrectionRes = await request(app.getHttpServer())
        .post(`/api/v1/seasons/${season.id}/logs`)
        .set(superAdminHeader)
        .send({
          actionType: FarmingActionType.CORRECTION,
          description: "Đính chính bổ sung khác cùng trỏ vào log gốc",
          correctsLogId: original.id,
        })
        .expect(201);

      const parallelCorrection = (
        parallelCorrectionRes.body as ApiResponse<FarmingLogSchema>
      ).data;
      expect(parallelCorrection.correctsLogId).toBe(original.id);

      const generalCorrectionRes = await request(app.getHttpServer())
        .post(`/api/v1/seasons/${season.id}/logs`)
        .set(superAdminHeader)
        .send({
          actionType: FarmingActionType.CORRECTION,
          description: "Ghi chú đính chính chung cho toàn mùa vụ",
        })
        .expect(201);

      const generalCorrection = (
        generalCorrectionRes.body as ApiResponse<FarmingLogSchema>
      ).data;
      expect(generalCorrection.correctsLogId).toBeNull();
      expect(generalCorrection.correctsLog).toBeNull();

      const timelineRes = await request(app.getHttpServer())
        .get(`/api/v1/seasons/${season.id}/logs?limit=10`)
        .set(farmStaffHeader)
        .expect(200);

      const timeline = (
        timelineRes.body as ApiResponse<
          FarmingLogSchema[],
          PaginationMetaSchema
        >
      ).data;
      const hydratedOriginal = timeline.find((item) => item.id === original.id);
      expect(hydratedOriginal?.correctedBy.map((ref) => ref.id)).toEqual([
        firstCorrection.id,
        parallelCorrection.id,
      ]);
    });

    // Invariant: INV-FLOG-2
    it("rejects cross-season, missing, and non-correction correctsLogId payloads", async () => {
      const farm = await createFarm(setup.db);
      const plotA = await createPlot(setup.db, {
        farmId: farm.id,
        plotCode: "PLOT-FL-A",
      });
      const plotB = await createPlot(setup.db, {
        farmId: farm.id,
        plotCode: "PLOT-FL-B",
      });

      const seasonA = await createSeason(
        setup.db,
        SeasonMother.active({ plotId: plotA.id }),
      );
      const seasonB = await createSeason(
        setup.db,
        SeasonMother.active({ plotId: plotB.id }),
      );
      const seasonBLog = await createFarmingLog(
        setup.db,
        FarmingLogMother.watering({
          seasonId: seasonB.id,
          staffId: farmStaffUserId,
        }),
      );
      const seasonALog = await createFarmingLog(
        setup.db,
        FarmingLogMother.watering({
          seasonId: seasonA.id,
          staffId: farmStaffUserId,
        }),
      );

      const crossSeasonRes = await request(app.getHttpServer())
        .post(`/api/v1/seasons/${seasonA.id}/logs`)
        .set(farmStaffHeader)
        .send({
          actionType: FarmingActionType.CORRECTION,
          description: "Đính chính nhầm mùa vụ",
          correctsLogId: seasonBLog.id,
        })
        .expect(422);

      expect((crossSeasonRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.FARMING_LOG_CORRECTION_TARGET_INVALID,
      );

      const missingTargetRes = await request(app.getHttpServer())
        .post(`/api/v1/seasons/${seasonA.id}/logs`)
        .set(farmStaffHeader)
        .send({
          actionType: FarmingActionType.CORRECTION,
          description: "Đính chính log không tồn tại",
          correctsLogId: UNKNOWN_UUID_V7,
        })
        .expect(422);

      expect((missingTargetRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.FARMING_LOG_CORRECTION_TARGET_INVALID,
      );

      const nonCorrectionRes = await request(app.getHttpServer())
        .post(`/api/v1/seasons/${seasonA.id}/logs`)
        .set(farmStaffHeader)
        .send({
          actionType: FarmingActionType.WEEDING,
          description: "Làm cỏ kèm correctsLogId sai loại",
          correctsLogId: seasonALog.id,
        })
        .expect(422);

      expect((nonCorrectionRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.FARMING_LOG_CORRECTION_TARGET_INVALID,
      );
    });

    // Invariant: INV-FLOG-3
    it("enforces phase-scoped action gates across planning, harvested, and completed seasons", async () => {
      const farm = await createFarm(setup.db);
      const plot = await createPlot(setup.db, {
        farmId: farm.id,
        plotCode: "PLOT-FL-PHASE",
      });

      const planningSeason = await createSeason(
        setup.db,
        SeasonMother.planning({ plotId: plot.id }),
      );
      const completedSeason = await createSeason(
        setup.db,
        SeasonMother.completed({ plotId: plot.id }),
      );
      const harvestedSeason = await createSeason(
        setup.db,
        SeasonMother.harvested({ plotId: plot.id }),
      );

      await request(app.getHttpServer())
        .post(`/api/v1/seasons/${planningSeason.id}/logs`)
        .set(farmStaffHeader)
        .send({
          actionType: FarmingActionType.SOIL_TESTING,
          description: "Kiểm định đất trước xuống giống",
        })
        .expect(201);

      const planningRejected = await request(app.getHttpServer())
        .post(`/api/v1/seasons/${planningSeason.id}/logs`)
        .set(farmStaffHeader)
        .send({
          actionType: FarmingActionType.SEEDING,
          description: "Gieo hạt khi mùa chưa active",
        })
        .expect(422);

      expect((planningRejected.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.FARMING_LOG_SEASON_STATUS_INVALID,
      );

      await request(app.getHttpServer())
        .post(`/api/v1/seasons/${harvestedSeason.id}/logs`)
        .set(farmStaffHeader)
        .send({
          actionType: FarmingActionType.HARVESTING,
          description: "Thu hoạch bổ sung đợt cuối",
        })
        .expect(201);

      const completedRejected = await request(app.getHttpServer())
        .post(`/api/v1/seasons/${completedSeason.id}/logs`)
        .set(farmStaffHeader)
        .send({
          actionType: FarmingActionType.WATERING,
          description: "Tưới sau khi đã hoàn tất",
        })
        .expect(422);

      expect((completedRejected.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.FARMING_LOG_SEASON_STATUS_INVALID,
      );

      await request(app.getHttpServer())
        .post(`/api/v1/seasons/${completedSeason.id}/logs`)
        .set(adminHeader)
        .send({
          actionType: FarmingActionType.CORRECTION,
          description: "Bổ sung đính chính phục vụ audit sau thu hoạch",
        })
        .expect(201);
    });

    // Invariant: INV-FLOG-4, INV-FLOG-5
    it("rejects arbitrary media hosts, wrong Cloudinary folders, duplicate URLs, over-limit arrays, and client timestamps", async () => {
      const season = await createSeason(setup.db, SeasonMother.active());

      const badMediaPayloads = [
        [
          `https://evil.example.com/${activeCloudName}/image/upload/farming_logs/a.png`,
        ],
        [
          `http://res.cloudinary.com/${activeCloudName}/image/upload/farming_logs/a.png`,
        ],
        [
          `https://res.cloudinary.com/${activeCloudName}/image/upload/v1/products/a.png`,
        ],
        [
          `https://res.cloudinary.com/${activeCloudName}/image/upload/w_300/farming_logs/a.png`,
        ],
        [
          `https://res.cloudinary.com/${activeCloudName}/image/upload/farming_logs/dup.png`,
          `https://res.cloudinary.com/${activeCloudName}/image/upload/farming_logs/dup.png`,
        ],
        [
          `https://res.cloudinary.com/${activeCloudName}/image/upload/farming_logs/1.png`,
          `https://res.cloudinary.com/${activeCloudName}/image/upload/farming_logs/2.png`,
          `https://res.cloudinary.com/${activeCloudName}/image/upload/farming_logs/3.png`,
          `https://res.cloudinary.com/${activeCloudName}/image/upload/farming_logs/4.png`,
        ],
      ];

      for (const mediaUrls of badMediaPayloads) {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/seasons/${season.id}/logs`)
          .set(farmStaffHeader)
          .send({
            actionType: FarmingActionType.WATERING,
            description: "Kiểm tra media boundary",
            mediaUrls,
          })
          .expect(400);

        const problem = res.body as Rfc9457ProblemDetails;
        expect(problem.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
        expect(problem.invalidParams.length).toBeGreaterThan(0);
      }

      const clientLoggedAtRes = await request(app.getHttpServer())
        .post(`/api/v1/seasons/${season.id}/logs`)
        .set(farmStaffHeader)
        .send({
          actionType: FarmingActionType.WATERING,
          description: "Thử ghi đè thời gian",
          loggedAt: "2020-01-01T00:00:00.000Z",
        })
        .expect(400);

      const loggedAtProblem = clientLoggedAtRes.body as Rfc9457ProblemDetails;
      expect(loggedAtProblem.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
      expect(loggedAtProblem.invalidParams[0]?.code).toBe(
        API_ERROR_CODES.UNRECOGNIZED_KEYS,
      );

      const clientStaffIdRes = await request(app.getHttpServer())
        .post(`/api/v1/seasons/${season.id}/logs`)
        .set(farmStaffHeader)
        .send({
          actionType: FarmingActionType.WATERING,
          description: "Thử giả mạo staffId",
          staffId: UNKNOWN_UUID_V7,
        })
        .expect(400);

      const staffIdProblem = clientStaffIdRes.body as Rfc9457ProblemDetails;
      expect(staffIdProblem.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
      expect(staffIdProblem.invalidParams[0]?.code).toBe(
        API_ERROR_CODES.UNRECOGNIZED_KEYS,
      );

      const nonUuidV7PostRes = await request(app.getHttpServer())
        .post("/api/v1/seasons/00000000-0000-4000-8000-000000000001/logs")
        .set(farmStaffHeader)
        .send({
          actionType: FarmingActionType.WATERING,
          description: "UUIDv4 không hợp lệ",
        })
        .expect(400);

      const nonUuidProblem = nonUuidV7PostRes.body as Rfc9457ProblemDetails;
      expect(nonUuidProblem.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
      expect(nonUuidProblem.invalidParams[0]).toMatchObject({
        code: API_ERROR_CODES.INVALID_FORMAT,
        params: { format: "regex" },
      });

      await request(app.getHttpServer())
        .post(`/api/v1/seasons/${UNKNOWN_UUID_V7}/logs`)
        .set(farmStaffHeader)
        .send({
          actionType: FarmingActionType.WATERING,
          description: "Mùa vụ không tồn tại",
        })
        .expect(404);
    });

    it("deduplicates replayed requests with Idempotency-Key and rejects mismatched payload reuse", async () => {
      const season = await createSeason(setup.db, SeasonMother.active());
      const idempotencyKey = randomUUID();
      const payload = {
        actionType: FarmingActionType.WEEDING,
        description: "Làm cỏ luống 2",
      };

      const first = await request(app.getHttpServer())
        .post(`/api/v1/seasons/${season.id}/logs`)
        .set(farmStaffHeader)
        .set("Idempotency-Key", idempotencyKey)
        .send(payload)
        .expect(201);

      const replay = await request(app.getHttpServer())
        .post(`/api/v1/seasons/${season.id}/logs`)
        .set(farmStaffHeader)
        .set("Idempotency-Key", idempotencyKey)
        .send(payload)
        .expect(201);

      expect((replay.body as ApiResponse<FarmingLogSchema>).data.id).toBe(
        (first.body as ApiResponse<FarmingLogSchema>).data.id,
      );

      await request(app.getHttpServer())
        .post(`/api/v1/seasons/${season.id}/logs`)
        .set(farmStaffHeader)
        .set("Idempotency-Key", idempotencyKey)
        .send({
          actionType: FarmingActionType.WEEDING,
          description: "Payload khác cùng key",
        })
        .expect(422);
    });
  });

  describe("GET /api/v1/seasons/:id/logs", () => {
    it("paginates logs ordered by action date and hydrates cross-page correction linkage", async () => {
      const season = await createSeason(setup.db, SeasonMother.active());

      const oldest = await createFarmingLog(
        setup.db,
        FarmingLogMother.soilTesting({
          seasonId: season.id,
          staffId: farmStaffUserId,
          description: "Log 1 - Kiểm tra đất",
          mediaUrls: null,
          loggedAt: new Date("2026-11-01T08:00:00.000Z"),
        }),
      );
      const middle = await createFarmingLog(
        setup.db,
        FarmingLogMother.watering({
          seasonId: season.id,
          staffId: farmStaffUserId,
          description: "Log 2 - Tưới nước",
          loggedAt: new Date("2026-11-02T08:00:00.000Z"),
        }),
      );
      const newestCorrection = await createFarmingLog(
        setup.db,
        FarmingLogMother.correction(oldest.id, {
          seasonId: season.id,
          staffId: farmStaffUserId,
          description: "Log 3 - Đính chính Log 1",
          loggedAt: new Date("2026-11-03T08:00:00.000Z"),
        }),
      );

      const page1Desc = await request(app.getHttpServer())
        .get(
          `/api/v1/seasons/${season.id}/logs?page=1&limit=2&sort=loggedAt:desc`,
        )
        .set(farmStaffHeader)
        .expect(200);

      const page1Body = page1Desc.body as ApiResponse<
        FarmingLogSchema[],
        PaginationMetaSchema
      >;
      expect(page1Body.meta).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
        hasNextPage: true,
        hasPrevPage: false,
      });
      expect(page1Body.data.map((item) => item.id)).toEqual([
        newestCorrection.id,
        middle.id,
      ]);
      expect(page1Body.data[0]?.correctsLog).toMatchObject({
        id: oldest.id,
        actionType: FarmingActionType.SOIL_TESTING,
      });

      const page2Desc = await request(app.getHttpServer())
        .get(
          `/api/v1/seasons/${season.id}/logs?page=2&limit=2&sort=loggedAt:desc`,
        )
        .set(farmStaffHeader)
        .expect(200);

      const page2Body = page2Desc.body as ApiResponse<
        FarmingLogSchema[],
        PaginationMetaSchema
      >;
      expect(page2Body.data).toHaveLength(1);
      expect(page2Body.data[0]?.id).toBe(oldest.id);
      expect(page2Body.data[0]?.mediaUrls).toEqual([]);
      expect(page2Body.data[0]?.correctedBy).toEqual([
        {
          id: newestCorrection.id,
          loggedAt: "2026-11-03T08:00:00.000Z",
          staff: {
            id: farmStaffUserId,
            fullName: expect.any(String),
          },
        },
      ]);

      const ascFiltered = await request(app.getHttpServer())
        .get(
          `/api/v1/seasons/${season.id}/logs?sort=loggedAt:asc&actionType=${FarmingActionType.CORRECTION}`,
        )
        .set(farmStaffHeader)
        .expect(200);

      const ascBody = ascFiltered.body as ApiResponse<
        FarmingLogSchema[],
        PaginationMetaSchema
      >;
      expect(ascBody.data.map((item) => item.id)).toEqual([
        newestCorrection.id,
      ]);

      await request(app.getHttpServer())
        .get("/api/v1/seasons/00000000-0000-4000-8000-000000000001/logs")
        .set(farmStaffHeader)
        .expect(400);

      await request(app.getHttpServer())
        .get(`/api/v1/seasons/${UNKNOWN_UUID_V7}/logs`)
        .set(farmStaffHeader)
        .expect(404);
    });
  });

  describe("Immutability Trigger & Concurrency Matrix", () => {
    // Invariant: INV-FLOG-1
    it("rejects direct UPDATE and DELETE on farming_logs via trigger and maps to forbidden", async () => {
      const log = await createFarmingLog(setup.db);

      let updateError: unknown;
      try {
        await setup.db
          .update(farmingLogs)
          .set({ description: "Cố tình sửa nhật ký" })
          .where(eq(farmingLogs.id, log.id));
      } catch (error) {
        updateError = error;
      }

      expect(updateError).toBeDefined();
      const updateDetails = extractDatabaseErrorDetails(updateError);
      expect(updateDetails.code).toBe(PG_ERROR_CODE.RAISE_EXCEPTION);
      expect(updateDetails.message).toContain("FARMING_LOG_IMMUTABLE");

      let deleteError: unknown;
      try {
        await setup.db.delete(farmingLogs).where(eq(farmingLogs.id, log.id));
      } catch (error) {
        deleteError = error;
      }

      expect(deleteError).toBeDefined();
      const deleteDetails = extractDatabaseErrorDetails(deleteError);
      expect(deleteDetails.code).toBe(PG_ERROR_CODE.RAISE_EXCEPTION);
      expect(deleteDetails.message).toContain("FARMING_LOG_IMMUTABLE");

      const filter = new GlobalExceptionFilter();
      const invokeFilter = (dbErr: unknown) => {
        let status = 0;
        let body: Rfc9457ProblemDetails | undefined;
        const host = {
          switchToHttp: () => ({
            getResponse: () => ({
              status(code: number) {
                status = code;
                return this;
              },
              setHeader() {
                return this;
              },
              json(payload: Rfc9457ProblemDetails) {
                body = payload;
              },
            }),
            getRequest: () => ({
              originalUrl: `/api/v1/seasons/${log.seasonId}/logs`,
            }),
          }),
        } as unknown as ArgumentsHost;

        filter.catch(dbErr, host);
        return { status, body };
      };

      const updateResult = invokeFilter(updateError);
      expect(updateResult.status).toBe(403);
      expect(updateResult.body?.code).toBe(
        API_ERROR_CODES.FARMING_LOG_IMMUTABLE,
      );

      const deleteResult = invokeFilter(deleteError);
      expect(deleteResult.status).toBe(403);
      expect(deleteResult.body?.code).toBe(
        API_ERROR_CODES.FARMING_LOG_IMMUTABLE,
      );
    });

    // Invariant: INV-FLOG-2
    it("enforces database self-correction check constraint on direct inserts", async () => {
      const season = await createSeason(setup.db, SeasonMother.active());
      const selfId = "019fa8bc-8f4d-7000-b366-e691f45c0123";

      let checkError: unknown;
      try {
        await setup.db.insert(farmingLogs).values({
          id: selfId,
          seasonId: season.id,
          staffId: farmStaffUserId,
          actionType: FarmingActionType.CORRECTION,
          description: "Tự đính chính chính mình ở tầng SQL",
          correctsLogId: selfId,
        });
      } catch (error) {
        checkError = error;
      }

      expect(checkError).toBeDefined();
      const details = extractDatabaseErrorDetails(checkError);
      expect(details.code).toBe(PG_ERROR_CODE.CHECK_VIOLATION);
      expect(details.constraint).toBe("farming_logs_no_self_correction_chk");
    });

    it("serializes concurrent log creation against planning season deletion without cascading errors", async () => {
      const planningSeason = await createSeason(
        setup.db,
        SeasonMother.planning(),
      );

      const [postRes, deleteRes] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/seasons/${planningSeason.id}/logs`)
          .set(farmStaffHeader)
          .send({
            actionType: FarmingActionType.SOIL_TESTING,
            description: "Kiểm định đất đồng thời",
          }),
        request(app.getHttpServer())
          .delete(`/api/v1/seasons/${planningSeason.id}`)
          .set(adminHeader),
      ]);

      const outcomes = `${postRes.status}:${deleteRes.status}`;
      expect(["201:409", "404:204"]).toContain(outcomes);
      if (deleteRes.status === 409) {
        expect((deleteRes.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.SEASON_NOT_DELETABLE,
        );
      }
    });

    it("serializes concurrent log creation against season completion and allows parallel logs on active seasons", async () => {
      const farm = await createFarm(setup.db);
      const plotA = await createPlot(setup.db, {
        farmId: farm.id,
        plotCode: "PLOT-CONC-A",
      });
      const plotB = await createPlot(setup.db, {
        farmId: farm.id,
        plotCode: "PLOT-CONC-B",
      });

      const harvestedSeason = await createSeason(
        setup.db,
        SeasonMother.harvested({ plotId: plotA.id }),
      );

      const [logRes, completeRes] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/seasons/${harvestedSeason.id}/logs`)
          .set(farmStaffHeader)
          .send({
            actionType: FarmingActionType.HARVESTING,
            description: "Thu hoạch sát giờ đóng mùa",
          }),
        request(app.getHttpServer())
          .patch(`/api/v1/seasons/${harvestedSeason.id}`)
          .set(adminHeader)
          .send({ status: SeasonStatus.COMPLETED }),
      ]);

      expect(completeRes.status).toBe(200);
      expect([201, 422]).toContain(logRes.status);

      const activeSeason = await createSeason(
        setup.db,
        SeasonMother.active({ plotId: plotB.id }),
      );

      const [staffRes, adminRes] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/seasons/${activeSeason.id}/logs`)
          .set(farmStaffHeader)
          .send({
            actionType: FarmingActionType.WATERING,
            description: "Nhân viên 1 tưới khu Đông",
          }),
        request(app.getHttpServer())
          .post(`/api/v1/seasons/${activeSeason.id}/logs`)
          .set(adminHeader)
          .send({
            actionType: FarmingActionType.WEEDING,
            description: "Nhân viên 2 làm cỏ khu Tây",
          }),
      ]);

      expect(staffRes.status).toBe(201);
      expect(adminRes.status).toBe(201);
    });
  });
});
