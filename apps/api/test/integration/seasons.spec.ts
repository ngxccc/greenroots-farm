import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import request from "supertest";
import { type INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { eq, sql } from "drizzle-orm";
import { API_ERROR_CODES, SeasonStatus, UserRole } from "@greenroots/shared";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";
import type { ApiResponse } from "@/common/utils/api-response.util";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";
import { plots, seasons } from "@/database/schemas";
import {
  createFarm,
  createMinimalBatchForSeason,
  createMinimalFarmingLogForSeason,
  createPlot,
  createSeason,
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

type SeasonSchema = components["schemas"]["SeasonDto"];
type PaginationMetaSchema = components["schemas"]["PaginationMetaDto"];

const UNKNOWN_UUID_V7 = "019fa8bc-8f4d-7000-b366-e691f45cffff";

describe("Seasons Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let jwtService: JwtService;

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
    adminHeader = adminSession.authHeader;
    superAdminHeader = superAdminSession.authHeader;
  });

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  describe("RBAC Matrix", () => {
    it("forbids unauthenticated, customer, and sales callers across all season endpoints", async () => {
      const plot = await createPlot(setup.db);
      const season = await createSeason(
        setup.db,
        SeasonMother.planning({ plotId: plot.id }),
      );

      await request(app.getHttpServer()).get("/api/v1/seasons").expect(401);
      await request(app.getHttpServer())
        .get(`/api/v1/seasons/${season.id}`)
        .expect(401);
      await request(app.getHttpServer())
        .post("/api/v1/seasons")
        .send({
          plotId: plot.id,
          seasonName: "Vụ Test",
          startDate: "2026-09-01",
          expectedHarvestDate: "2026-11-01",
        })
        .expect(401);
      await request(app.getHttpServer())
        .patch(`/api/v1/seasons/${season.id}`)
        .send({ seasonName: "Updated" })
        .expect(401);
      await request(app.getHttpServer())
        .delete(`/api/v1/seasons/${season.id}`)
        .expect(401);

      for (const header of [guestHeader, customerHeader, salesHeader]) {
        await request(app.getHttpServer())
          .get("/api/v1/seasons")
          .set(header)
          .expect(403);
        await request(app.getHttpServer())
          .get(`/api/v1/seasons/${season.id}`)
          .set(header)
          .expect(403);
        await request(app.getHttpServer())
          .post("/api/v1/seasons")
          .set(header)
          .send({
            plotId: plot.id,
            seasonName: "Vụ Test",
            startDate: "2026-09-01",
            expectedHarvestDate: "2026-11-01",
          })
          .expect(403);
        await request(app.getHttpServer())
          .patch(`/api/v1/seasons/${season.id}`)
          .set(header)
          .send({ seasonName: "Updated" })
          .expect(403);
        await request(app.getHttpServer())
          .delete(`/api/v1/seasons/${season.id}`)
          .set(header)
          .expect(403);
      }

      await request(app.getHttpServer())
        .delete(`/api/v1/seasons/${season.id}`)
        .set(farmStaffHeader)
        .expect(403);
    });
  });

  describe("GET /api/v1/seasons & GET /api/v1/seasons/:id", () => {
    it("paginates, filters by status and plotId, escapes LIKE wildcards, and sorts cleanly", async () => {
      const farm = await createFarm(setup.db);
      const plotA = await createPlot(setup.db, {
        farmId: farm.id,
        plotCode: "PLOT-S1",
      });
      const plotB = await createPlot(setup.db, {
        farmId: farm.id,
        plotCode: "PLOT-S2",
      });

      await createSeason(
        setup.db,
        SeasonMother.planning({
          plotId: plotA.id,
          seasonName: "Vụ 100%_Hữu Cơ A",
          startDate: "2026-08-01",
          expectedHarvestDate: "2026-10-01",
        }),
      );
      await createSeason(
        setup.db,
        SeasonMother.active({
          plotId: plotA.id,
          seasonName: "Vụ Cải Bó Xôi",
          startDate: "2026-09-01",
          expectedHarvestDate: "2026-11-01",
        }),
      );
      await createSeason(
        setup.db,
        SeasonMother.completed({
          plotId: plotB.id,
          seasonName: "Vụ 200%_Khác",
          startDate: "2026-06-01",
          expectedHarvestDate: "2026-07-15",
        }),
      );

      const listRes = await request(app.getHttpServer())
        .get("/api/v1/seasons")
        .set(farmStaffHeader)
        .query({
          plotId: plotA.id,
          status: SeasonStatus.PLANNING,
          q: "100%_",
          sort: "startDate:asc",
          page: "1",
          limit: "10",
        })
        .expect(200);

      const body = listRes.body as ApiResponse<
        SeasonSchema[],
        PaginationMetaSchema
      >;
      expect(body.meta?.total).toBe(1);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]?.seasonName).toBe("Vụ 100%_Hữu Cơ A");
      expect(body.data[0]?.plot.plotCode).toBe("PLOT-S1");
      expect(body.data[0]?.plot.deletedAt).toBeNull();
    });

    it("preserves nested plot summary when historical plot is soft-deleted and rejects unknown IDs", async () => {
      const plot = await createPlot(setup.db, { plotCode: "PLOT-OLD" });
      const season = await createSeason(
        setup.db,
        SeasonMother.completed({ plotId: plot.id }),
      );

      await request(app.getHttpServer())
        .delete(`/api/v1/plots/${plot.id}`)
        .set(adminHeader)
        .expect(204);

      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/seasons/${season.id}`)
        .set(farmStaffHeader)
        .expect(200);

      const detail = (detailRes.body as ApiResponse<SeasonSchema>).data;
      expect(detail.id).toBe(season.id);
      expect(detail.plot.plotCode).toBe("PLOT-OLD");
      expect(detail.plot.deletedAt).not.toBeNull();

      const missingRes = await request(app.getHttpServer())
        .get(`/api/v1/seasons/${UNKNOWN_UUID_V7}`)
        .set(farmStaffHeader)
        .expect(404);
      expect((missingRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.SEASON_NOT_FOUND,
      );
    });
  });

  describe("POST /api/v1/seasons", () => {
    // Invariant: INV-SEASON-5
    it("creates a planning season with plot summary and rejects unknown or soft-deleted plots", async () => {
      const livePlot = await createPlot(setup.db, {
        plotCode: "PLOT-LIVE",
        areaSqm: "950.50",
      });
      const deletedPlot = await createPlot(setup.db, {
        farmId: livePlot.farmId,
        plotCode: "PLOT-DEL",
      });
      await request(app.getHttpServer())
        .delete(`/api/v1/plots/${deletedPlot.id}`)
        .set(adminHeader)
        .expect(204);

      const createRes = await request(app.getHttpServer())
        .post("/api/v1/seasons")
        .set(farmStaffHeader)
        .send({
          plotId: livePlot.id,
          seasonName: "Vụ Đông Xuân - Cà Chua Bi",
          startDate: "2026-09-01",
          expectedHarvestDate: "2026-09-01",
        })
        .expect(201);

      const created = (createRes.body as ApiResponse<SeasonSchema>).data;
      expect(created.status).toBe(SeasonStatus.PLANNING);
      expect(created.plotId).toBe(livePlot.id);
      expect(created.plot.plotCode).toBe("PLOT-LIVE");
      expect(created.plot.areaSqm).toBe(950.5);

      const deletedPlotRes = await request(app.getHttpServer())
        .post("/api/v1/seasons")
        .set(farmStaffHeader)
        .send({
          plotId: deletedPlot.id,
          seasonName: "Cannot Link Deleted",
          startDate: "2026-09-01",
          expectedHarvestDate: "2026-10-01",
        })
        .expect(404);
      expect((deletedPlotRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.PLOT_NOT_FOUND,
      );

      const missingPlotRes = await request(app.getHttpServer())
        .post("/api/v1/seasons")
        .set(farmStaffHeader)
        .send({
          plotId: UNKNOWN_UUID_V7,
          seasonName: "Missing Plot",
          startDate: "2026-09-01",
          expectedHarvestDate: "2026-10-01",
        })
        .expect(404);
      expect((missingPlotRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.PLOT_NOT_FOUND,
      );
    });

    // Invariant: INV-SEASON-4
    it("rejects inverted dates, invalid calendar dates, unknown fields, and enforces DB date check", async () => {
      const plot = await createPlot(setup.db);

      const invertedRes = await request(app.getHttpServer())
        .post("/api/v1/seasons")
        .set(farmStaffHeader)
        .send({
          plotId: plot.id,
          seasonName: "Inverted Dates",
          startDate: "2026-10-15",
          expectedHarvestDate: "2026-10-01",
        })
        .expect(400);
      expect(
        (invertedRes.body as Rfc9457ProblemDetails).invalidParams[0]?.name,
      ).toBe("expectedHarvestDate");

      const invalidDayRes = await request(app.getHttpServer())
        .post("/api/v1/seasons")
        .set(farmStaffHeader)
        .send({
          plotId: plot.id,
          seasonName: "Invalid Day",
          startDate: "2026-02-30",
          expectedHarvestDate: "2026-03-10",
        })
        .expect(400);
      expect(
        (invalidDayRes.body as Rfc9457ProblemDetails).invalidParams[0]?.code,
      ).toBe(API_ERROR_CODES.INVALID_FORMAT);

      const timestampRes = await request(app.getHttpServer())
        .post("/api/v1/seasons")
        .set(farmStaffHeader)
        .send({
          plotId: plot.id,
          seasonName: "Timestamp Rejected",
          startDate: "2026-09-01T00:00:00.000Z",
          expectedHarvestDate: "2026-10-01",
        })
        .expect(400);
      expect(
        (timestampRes.body as Rfc9457ProblemDetails).invalidParams[0]?.code,
      ).toBe(API_ERROR_CODES.INVALID_FORMAT);

      const extraKeyRes = await request(app.getHttpServer())
        .post("/api/v1/seasons")
        .set(farmStaffHeader)
        .send({
          plotId: plot.id,
          seasonName: "Client Cannot Force Active",
          startDate: "2026-09-01",
          expectedHarvestDate: "2026-10-01",
          status: SeasonStatus.ACTIVE,
        })
        .expect(400);
      expect(
        (extraKeyRes.body as Rfc9457ProblemDetails).invalidParams.some(
          (p) => p.code === API_ERROR_CODES.UNRECOGNIZED_KEYS,
        ),
      ).toBe(true);

      // Direct SQL check for seasons_date_range_valid_chk (23514).
      try {
        await setup.db.insert(seasons).values({
          plotId: plot.id,
          seasonName: "SQL Date Violation",
          startDate: "2026-12-01",
          expectedHarvestDate: "2026-11-01",
          status: SeasonStatus.PLANNING,
        });
        expect.unreachable("Expected CHECK constraint violation (23514)");
      } catch (error) {
        const dbError = extractDatabaseErrorDetails(error);
        expect(dbError.code).toBe(PG_ERROR_CODE.CHECK_VIOLATION);
        expect(dbError.constraint).toBe("seasons_date_range_valid_chk");
      }
    });
  });

  describe("PATCH /api/v1/seasons/:id", () => {
    // Invariant: INV-SEASON-1
    it("advances linearly planning -> active -> harvested -> completed and rejects skipped or reversed transitions", async () => {
      const plot = await createPlot(setup.db);
      const season = await createSeason(
        setup.db,
        SeasonMother.planning({ plotId: plot.id }),
      );

      // Skipped from planning -> harvested / completed.
      for (const target of [SeasonStatus.HARVESTED, SeasonStatus.COMPLETED]) {
        const skippedRes = await request(app.getHttpServer())
          .patch(`/api/v1/seasons/${season.id}`)
          .set(farmStaffHeader)
          .send({ status: target })
          .expect(422);
        expect((skippedRes.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.SEASON_INVALID_STATUS_TRANSITION,
        );
      }

      // planning -> active
      const activeRes = await request(app.getHttpServer())
        .patch(`/api/v1/seasons/${season.id}`)
        .set(farmStaffHeader)
        .send({ status: SeasonStatus.ACTIVE })
        .expect(200);
      expect((activeRes.body as ApiResponse<SeasonSchema>).data.status).toBe(
        SeasonStatus.ACTIVE,
      );

      // Same-status no-op with valid mutable field in active -> 200 OK.
      const noopActiveRes = await request(app.getHttpServer())
        .patch(`/api/v1/seasons/${season.id}`)
        .set(farmStaffHeader)
        .send({
          status: SeasonStatus.ACTIVE,
          expectedHarvestDate: "2026-12-28",
        })
        .expect(200);
      expect(
        (noopActiveRes.body as ApiResponse<SeasonSchema>).data
          .expectedHarvestDate,
      ).toBe("2026-12-28");

      // Reversed/skipped from active -> planning / completed.
      for (const target of [SeasonStatus.PLANNING, SeasonStatus.COMPLETED]) {
        const invalidRes = await request(app.getHttpServer())
          .patch(`/api/v1/seasons/${season.id}`)
          .set(farmStaffHeader)
          .send({ status: target })
          .expect(422);
        expect((invalidRes.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.SEASON_INVALID_STATUS_TRANSITION,
        );
      }

      // active -> harvested
      const harvestedRes = await request(app.getHttpServer())
        .patch(`/api/v1/seasons/${season.id}`)
        .set(farmStaffHeader)
        .send({ status: SeasonStatus.HARVESTED })
        .expect(200);
      expect((harvestedRes.body as ApiResponse<SeasonSchema>).data.status).toBe(
        SeasonStatus.HARVESTED,
      );

      // Reversed or same-status from harvested -> planning / active / harvested.
      for (const target of [
        SeasonStatus.PLANNING,
        SeasonStatus.ACTIVE,
        SeasonStatus.HARVESTED,
      ]) {
        const invalidHarvestedRes = await request(app.getHttpServer())
          .patch(`/api/v1/seasons/${season.id}`)
          .set(farmStaffHeader)
          .send({ status: target })
          .expect(422);
        expect((invalidHarvestedRes.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.SEASON_INVALID_STATUS_TRANSITION,
        );
      }

      // harvested -> completed
      const completedRes = await request(app.getHttpServer())
        .patch(`/api/v1/seasons/${season.id}`)
        .set(farmStaffHeader)
        .send({ status: SeasonStatus.COMPLETED })
        .expect(200);
      expect((completedRes.body as ApiResponse<SeasonSchema>).data.status).toBe(
        SeasonStatus.COMPLETED,
      );

      // Terminal completed rejects every PATCH (even same-status or metadata).
      for (const payload of [
        { status: SeasonStatus.PLANNING },
        { status: SeasonStatus.ACTIVE },
        { status: SeasonStatus.HARVESTED },
        { status: SeasonStatus.COMPLETED },
        { seasonName: "Mutate Completed" },
      ]) {
        const terminalRes = await request(app.getHttpServer())
          .patch(`/api/v1/seasons/${season.id}`)
          .set(farmStaffHeader)
          .send(payload)
          .expect(422);
        expect((terminalRes.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.SEASON_INVALID_STATUS_TRANSITION,
        );
      }

      // Missing ID -> 404; empty payload, inverted dates, and non-UUIDv7 :id -> 400.
      const missingPatchRes = await request(app.getHttpServer())
        .patch(`/api/v1/seasons/${UNKNOWN_UUID_V7}`)
        .set(farmStaffHeader)
        .send({ seasonName: "Missing" })
        .expect(404);
      expect((missingPatchRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.SEASON_NOT_FOUND,
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/seasons/${season.id}`)
        .set(farmStaffHeader)
        .send({})
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/api/v1/seasons/${season.id}`)
        .set(farmStaffHeader)
        .send({
          startDate: "2026-12-01",
          expectedHarvestDate: "2026-11-01",
        })
        .expect(400);

      const badIdRes = await request(app.getHttpServer())
        .patch("/api/v1/seasons/not-a-uuid")
        .set(farmStaffHeader)
        .send({ seasonName: "Bad ID" })
        .expect(400);
      expect(
        (badIdRes.body as Rfc9457ProblemDetails).invalidParams[0]?.code,
      ).toBe(API_ERROR_CODES.INVALID_FORMAT);
    });

    // Invariant: INV-SEASON-2, INV-SEASON-4
    it("enforces phase-scoped field locks and rejects partial date range inversions", async () => {
      const farm = await createFarm(setup.db);
      const plotA = await createPlot(setup.db, { farmId: farm.id });
      const plotB = await createPlot(setup.db, { farmId: farm.id });
      const deletedPlot = await createPlot(setup.db, { farmId: farm.id });
      await request(app.getHttpServer())
        .delete(`/api/v1/plots/${deletedPlot.id}`)
        .set(adminHeader)
        .expect(204);

      const planningSeason = await createSeason(
        setup.db,
        SeasonMother.planning({
          plotId: plotA.id,
          startDate: "2026-09-01",
          expectedHarvestDate: "2026-10-01",
        }),
      );

      // Partial startDate later than persisted expectedHarvestDate -> 422.
      const badDateRes = await request(app.getHttpServer())
        .patch(`/api/v1/seasons/${planningSeason.id}`)
        .set(farmStaffHeader)
        .send({ startDate: "2026-10-10" })
        .expect(422);
      expect((badDateRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.SEASON_INVALID_DATE_RANGE,
      );

      // Cannot move planning season onto soft-deleted plot -> 404.
      const movedDeletedRes = await request(app.getHttpServer())
        .patch(`/api/v1/seasons/${planningSeason.id}`)
        .set(farmStaffHeader)
        .send({ plotId: deletedPlot.id })
        .expect(404);
      expect((movedDeletedRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.PLOT_NOT_FOUND,
      );

      // Planning allows changing plotId, seasonName, and dates.
      const movedRes = await request(app.getHttpServer())
        .patch(`/api/v1/seasons/${planningSeason.id}`)
        .set(farmStaffHeader)
        .send({
          plotId: plotB.id,
          seasonName: "Vụ Mới Trên Lô B",
          startDate: "2026-09-05",
          expectedHarvestDate: "2026-11-15",
        })
        .expect(200);
      expect((movedRes.body as ApiResponse<SeasonSchema>).data.plotId).toBe(
        plotB.id,
      );

      // Move to active, then verify plotId & startDate are locked.
      await request(app.getHttpServer())
        .patch(`/api/v1/seasons/${planningSeason.id}`)
        .set(farmStaffHeader)
        .send({ status: SeasonStatus.ACTIVE })
        .expect(200);

      for (const lockedPayload of [
        { plotId: plotA.id },
        { startDate: "2026-09-04" },
      ]) {
        const lockedRes = await request(app.getHttpServer())
          .patch(`/api/v1/seasons/${planningSeason.id}`)
          .set(farmStaffHeader)
          .send(lockedPayload)
          .expect(422);
        expect((lockedRes.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.SEASON_INVALID_STATUS_TRANSITION,
        );
      }

      // Move to harvested, then verify all metadata edits are locked.
      await request(app.getHttpServer())
        .patch(`/api/v1/seasons/${planningSeason.id}`)
        .set(farmStaffHeader)
        .send({ status: SeasonStatus.HARVESTED })
        .expect(200);

      for (const harvestedPayload of [
        { seasonName: "Cannot Rename After Harvest" },
        { plotId: plotA.id },
        { startDate: "2026-09-02" },
        { expectedHarvestDate: "2026-12-01" },
      ]) {
        const harvestedEditRes = await request(app.getHttpServer())
          .patch(`/api/v1/seasons/${planningSeason.id}`)
          .set(farmStaffHeader)
          .send(harvestedPayload)
          .expect(422);
        expect((harvestedEditRes.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.SEASON_INVALID_STATUS_TRANSITION,
        );
      }

      // Even after the historical plot is soft-deleted, invalid activation returns 422 instead of 404.
      await request(app.getHttpServer())
        .delete(`/api/v1/plots/${plotB.id}`)
        .set(adminHeader)
        .expect(204);

      const reactivateAfterPlotDeleteRes = await request(app.getHttpServer())
        .patch(`/api/v1/seasons/${planningSeason.id}`)
        .set(farmStaffHeader)
        .send({ status: SeasonStatus.ACTIVE })
        .expect(422);
      expect(
        (reactivateAfterPlotDeleteRes.body as Rfc9457ProblemDetails).code,
      ).toBe(API_ERROR_CODES.SEASON_INVALID_STATUS_TRANSITION);
    });

    // Invariant: INV-SEASON-3
    it("allows at most one active season per plot and serializes concurrent activations", async () => {
      const plot = await createPlot(setup.db);
      const seasonA = await createSeason(
        setup.db,
        SeasonMother.planning({ plotId: plot.id, seasonName: "Vụ A" }),
      );
      const seasonB = await createSeason(
        setup.db,
        SeasonMother.planning({ plotId: plot.id, seasonName: "Vụ B" }),
      );

      // Concurrent activation on the same plot (ADV-1).
      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/api/v1/seasons/${seasonA.id}`)
          .set(farmStaffHeader)
          .send({ status: SeasonStatus.ACTIVE }),
        request(app.getHttpServer())
          .patch(`/api/v1/seasons/${seasonB.id}`)
          .set(farmStaffHeader)
          .send({ status: SeasonStatus.ACTIVE }),
      ]);

      const statuses = [resA.status, resB.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 409]);

      const conflictBody = (
        resA.status === 409 ? resA.body : resB.body
      ) as Rfc9457ProblemDetails;
      expect(conflictBody.code).toBe(
        API_ERROR_CODES.SEASON_PLOT_ACTIVE_CONFLICT,
      );

      // Complete the winning active season, then activating seasonB succeeds.
      const winnerId = resA.status === 200 ? seasonA.id : seasonB.id;
      const loserId = resA.status === 200 ? seasonB.id : seasonA.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/seasons/${winnerId}`)
        .set(farmStaffHeader)
        .send({ status: SeasonStatus.HARVESTED })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/seasons/${winnerId}`)
        .set(farmStaffHeader)
        .send({ status: SeasonStatus.COMPLETED })
        .expect(200);

      const secondActiveRes = await request(app.getHttpServer())
        .patch(`/api/v1/seasons/${loserId}`)
        .set(farmStaffHeader)
        .send({ status: SeasonStatus.ACTIVE })
        .expect(200);
      expect(
        (secondActiveRes.body as ApiResponse<SeasonSchema>).data.status,
      ).toBe(SeasonStatus.ACTIVE);
    });
  });

  describe("DELETE /api/v1/seasons/:id", () => {
    // Invariant: INV-SEASON-6
    it("deletes clean planning seasons and rejects missing, non-planning, batch-linked, and log-linked seasons", async () => {
      const farm = await createFarm(setup.db);
      const plot = await createPlot(setup.db, { farmId: farm.id });

      const cleanPlanning = await createSeason(
        setup.db,
        SeasonMother.planning({ plotId: plot.id, seasonName: "Clean Draft" }),
      );
      await request(app.getHttpServer())
        .delete(`/api/v1/seasons/${cleanPlanning.id}`)
        .set(adminHeader)
        .expect(204);

      const missingRes = await request(app.getHttpServer())
        .delete(`/api/v1/seasons/${cleanPlanning.id}`)
        .set(superAdminHeader)
        .expect(404);
      expect((missingRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.SEASON_NOT_FOUND,
      );

      for (const nonPlanningStatus of [
        SeasonStatus.ACTIVE,
        SeasonStatus.HARVESTED,
        SeasonStatus.COMPLETED,
      ]) {
        const s = await createSeason(setup.db, {
          plotId: plot.id,
          status: nonPlanningStatus,
        });
        const conflictRes = await request(app.getHttpServer())
          .delete(`/api/v1/seasons/${s.id}`)
          .set(adminHeader)
          .expect(409);
        expect((conflictRes.body as Rfc9457ProblemDetails).code).toBe(
          API_ERROR_CODES.SEASON_NOT_DELETABLE,
        );
      }

      const planningWithBatch = await createSeason(
        setup.db,
        SeasonMother.planning({ plotId: plot.id, seasonName: "Has Batch" }),
      );
      await createMinimalBatchForSeason(setup.db, planningWithBatch.id);

      const batchGuardRes = await request(app.getHttpServer())
        .delete(`/api/v1/seasons/${planningWithBatch.id}`)
        .set(adminHeader)
        .expect(409);
      expect((batchGuardRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.SEASON_NOT_DELETABLE,
      );

      // Must return 409 SEASON_NOT_DELETABLE rather than cascading into 403 FARMING_LOG_IMMUTABLE (ADV-5).
      const planningWithLog = await createSeason(
        setup.db,
        SeasonMother.planning({ plotId: plot.id, seasonName: "Has Log" }),
      );
      await createMinimalFarmingLogForSeason(setup.db, planningWithLog.id);

      const logGuardRes = await request(app.getHttpServer())
        .delete(`/api/v1/seasons/${planningWithLog.id}`)
        .set(adminHeader)
        .expect(409);
      expect((logGuardRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.SEASON_NOT_DELETABLE,
      );
    });
  });

  describe("Concurrency & Deadlock Protection", () => {
    it("serializes concurrent POST /seasons against DELETE /plots/:id without orphaned seasons", async () => {
      const plot = await createPlot(setup.db);

      const [createRes, deleteRes] = await Promise.all([
        request(app.getHttpServer())
          .post("/api/v1/seasons")
          .set(farmStaffHeader)
          .send({
            plotId: plot.id,
            seasonName: "Race Season",
            startDate: "2026-09-01",
            expectedHarvestDate: "2026-10-01",
          }),
        request(app.getHttpServer())
          .delete(`/api/v1/plots/${plot.id}`)
          .set(adminHeader),
      ]);

      expect(
        (createRes.status === 201 && deleteRes.status === 409) ||
          (createRes.status === 404 && deleteRes.status === 204),
      ).toBe(true);

      const [persistedPlot] = await setup.db
        .select({ deletedAt: plots.deletedAt })
        .from(plots)
        .where(eq(plots.id, plot.id));
      const persistedSeasons = await setup.db
        .select({ id: seasons.id })
        .from(seasons)
        .where(eq(seasons.plotId, plot.id));

      if (persistedPlot?.deletedAt !== null) {
        expect(persistedSeasons).toHaveLength(0);
      } else {
        expect(persistedSeasons).toHaveLength(1);
      }
    });

    it("serializes concurrent DELETE /seasons/:id against PATCH activation and opposite plot swaps", async () => {
      const farm = await createFarm(setup.db);
      const plotA = await createPlot(setup.db, { farmId: farm.id });
      const plotB = await createPlot(setup.db, { farmId: farm.id });

      const raceSeason = await createSeason(
        setup.db,
        SeasonMother.planning({
          plotId: plotA.id,
          seasonName: "Delete vs Activate",
        }),
      );

      const [deleteRes, activateRes] = await Promise.all([
        request(app.getHttpServer())
          .delete(`/api/v1/seasons/${raceSeason.id}`)
          .set(adminHeader),
        request(app.getHttpServer())
          .patch(`/api/v1/seasons/${raceSeason.id}`)
          .set(farmStaffHeader)
          .send({ status: SeasonStatus.ACTIVE }),
      ]);

      expect(
        (deleteRes.status === 204 && activateRes.status === 404) ||
          (deleteRes.status === 409 && activateRes.status === 200),
      ).toBe(true);

      // Bidirectional plotId swap on planning seasons (ADV-4) completes without deadlock.
      const swap1 = await createSeason(
        setup.db,
        SeasonMother.planning({ plotId: plotA.id, seasonName: "Swap 1" }),
      );
      const swap2 = await createSeason(
        setup.db,
        SeasonMother.planning({ plotId: plotB.id, seasonName: "Swap 2" }),
      );

      const [swapRes1, swapRes2] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/api/v1/seasons/${swap1.id}`)
          .set(farmStaffHeader)
          .send({ plotId: plotB.id }),
        request(app.getHttpServer())
          .patch(`/api/v1/seasons/${swap2.id}`)
          .set(farmStaffHeader)
          .send({ plotId: plotA.id }),
      ]);

      expect(swapRes1.status).toBe(200);
      expect(swapRes2.status).toBe(200);
    });
  });
});
