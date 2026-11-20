import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { API_ERROR_CODES, SeasonStatus } from "@greenroots/shared";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import { createMockDb } from "../../../test/mocks/mock-database";
import { SeasonsService } from "./seasons.service";
import type { TraceCacheService } from "./trace-cache.service";

type MockDb = ReturnType<typeof createMockDb> & {
  setSelectResultsQueue: (results: unknown[][]) => void;
  mockInsertValues: { mockImplementationOnce: (fn: () => unknown) => void };
  mockUpdateWhere: { mockImplementationOnce: (fn: () => unknown) => void };
};

describe("SeasonsService", () => {
  const plotId = "019fa8bc-8f4d-7000-b366-e691f45cfb91";
  const otherPlotId = "019fa8bc-8f4d-7000-b366-e691f45cfb92";
  const seasonId = "019fa8bc-8f4d-7000-b366-e691f45cfb93";
  const timestamp = new Date("2026-11-19T00:00:00.000Z");

  const samplePlotSummary = {
    id: plotId,
    plotCode: "PLOT-A1",
    name: "Lô A1",
    areaSqm: "1200.00",
    deletedAt: null,
  };

  const sampleSeasonRow = {
    id: seasonId,
    plotId,
    seasonName: "Vụ Đông Xuân 2026",
    startDate: "2026-09-01",
    expectedHarvestDate: "2026-12-01",
    status: SeasonStatus.PLANNING,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  let service: SeasonsService;
  let mockDb: MockDb;
  let mockTraceCacheService: {
    invalidateBySeasonId: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    mockDb = createMockDb() as unknown as MockDb;
    mockTraceCacheService = {
      invalidateBySeasonId: mock(() => Promise.resolve()),
    };
    service = new SeasonsService(
      mockDb,
      mockTraceCacheService as unknown as TraceCacheService,
    );
  });

  describe("listSeasons", () => {
    it("escapes LIKE wildcards and maps joined plot summaries", async () => {
      mockDb.setSelectResultsQueue([
        [{ total: 1 }],
        [{ season: sampleSeasonRow, plot: samplePlotSummary }],
      ]);

      const result = await service.listSeasons({
        q: "100%_\\",
        page: 1,
        limit: 20,
        sort: "createdAt:desc",
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.plot.areaSqm).toBe(1200);
      expect(result.items[0]?.plot.deletedAt).toBeNull();
    });
  });

  describe("createSeason", () => {
    it("maps PostgreSQL 23514 check violation on seasons_date_range_valid_chk to 422", async () => {
      mockDb.setSelectResultsQueue([[samplePlotSummary]]);
      mockDb.mockInsertValues.mockImplementationOnce(() => ({
        returning: () =>
          Promise.reject(
            Object.assign(new Error("check violation"), {
              cause: {
                code: PG_ERROR_CODE.CHECK_VIOLATION,
                constraint: "seasons_date_range_valid_chk",
              },
            }),
          ),
      }));

      try {
        await service.createSeason({
          plotId,
          seasonName: "Invalid DB Check",
          startDate: "2026-09-01",
          expectedHarvestDate: "2026-10-01",
        });
        expect.unreachable("Expected UnprocessableEntityException");
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual({
          code: API_ERROR_CODES.SEASON_INVALID_DATE_RANGE,
          detail: MESSAGES.SEASONS.INVALID_DATE_RANGE,
        });
      }
    });
  });

  describe("updateSeason", () => {
    it("rejects same-status harvested updates with 422 without updating DB", async () => {
      mockDb.setSelectResultsQueue([
        [{ ...sampleSeasonRow, status: SeasonStatus.HARVESTED }],
      ]);

      try {
        await service.updateSeason(seasonId, {
          status: SeasonStatus.HARVESTED,
        });
        expect.unreachable("Expected UnprocessableEntityException");
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual({
          code: API_ERROR_CODES.SEASON_INVALID_STATUS_TRANSITION,
          detail: MESSAGES.SEASONS.INVALID_STATUS_TRANSITION,
        });
      }
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("throws ConcurrencyException when locked season plotId drifts after pre-read", async () => {
      mockDb.setSelectResultsQueue([
        [sampleSeasonRow],
        [{ id: plotId }],
        [{ ...sampleSeasonRow, plotId: otherPlotId }],
      ]);

      try {
        await service.updateSeason(seasonId, { status: SeasonStatus.ACTIVE });
        expect.unreachable("Expected ConflictException");
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toEqual({
          code: API_ERROR_CODES.CONCURRENCY_CONFLICT,
          detail: MESSAGES.DATABASE.CONCURRENCY_CONFLICT,
        });
      }
    });

    it("maps PostgreSQL 23505 on seasons_one_active_per_plot_uidx to 409", async () => {
      mockDb.setSelectResultsQueue([
        [sampleSeasonRow],
        [{ id: plotId }],
        [sampleSeasonRow],
      ]);
      mockDb.mockUpdateWhere.mockImplementationOnce(() => ({
        returning: () =>
          Promise.reject(
            Object.assign(new Error("unique violation"), {
              cause: {
                code: PG_ERROR_CODE.UNIQUE_VIOLATION,
                constraint: "seasons_one_active_per_plot_uidx",
              },
            }),
          ),
      }));

      try {
        await service.updateSeason(seasonId, { status: SeasonStatus.ACTIVE });
        expect.unreachable("Expected ConflictException");
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toEqual({
          code: API_ERROR_CODES.SEASON_PLOT_ACTIVE_CONFLICT,
          detail: MESSAGES.SEASONS.PLOT_ACTIVE_CONFLICT,
        });
      }
    });
  });

  describe("deleteSeason", () => {
    it("throws NotFoundException when season does not exist", async () => {
      mockDb.setSelectResultsQueue([[]]);

      try {
        await service.deleteSeason(seasonId);
        expect.unreachable("Expected NotFoundException");
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toEqual({
          code: API_ERROR_CODES.SEASON_NOT_FOUND,
          detail: MESSAGES.SEASONS.NOT_FOUND,
        });
      }
    });
  });
});
