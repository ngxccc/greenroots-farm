import { beforeEach, describe, expect, it } from "bun:test";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { API_ERROR_CODES } from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import { createMockDb } from "../../../test/mocks/mock-database";
import { PlotsService } from "./plots.service";

type MockDb = ReturnType<typeof createMockDb> & {
  setSelectResult: (result: unknown[]) => void;
  setSelectResultsQueue: (results: unknown[][]) => void;
};

describe("PlotsService", () => {
  const farmId = "019fa8bc-8f4d-7000-b366-e691f45cfb90";
  const plotId = "019fa8bc-8f4d-7000-b366-e691f45cfb91";
  const timestamp = new Date("2026-11-19T00:00:00.000Z");

  const samplePlotRow = {
    id: plotId,
    farmId,
    plotCode: "PLOT-A1",
    name: "Lô A1",
    areaSqm: "1200.50",
    soilTestResult: null,
    waterTestResult: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  let service: PlotsService;
  let mockDb: MockDb;

  beforeEach(() => {
    mockDb = createMockDb() as unknown as MockDb;
    service = new PlotsService(mockDb);
  });

  describe("listPlots", () => {
    it("escapes SQL LIKE wildcards in search query and maps numeric areaSqm", async () => {
      mockDb.setSelectResultsQueue([[{ total: 1 }], [samplePlotRow]]);

      const result = await service.listPlots({
        q: "100%_\\",
        page: 1,
        limit: 20,
        sort: "createdAt:desc",
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.areaSqm).toBe(1200.5);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
    });
  });

  describe("getPlotById", () => {
    it("throws NotFoundException when plot is missing or soft-deleted", async () => {
      mockDb.setSelectResultsQueue([[]]);

      try {
        await service.getPlotById(plotId);
        expect.unreachable("Expected NotFoundException");
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toEqual({
          code: API_ERROR_CODES.PLOT_NOT_FOUND,
          detail: MESSAGES.PLOTS.NOT_FOUND,
        });
      }
    });
  });

  describe("createPlot", () => {
    it("throws NotFoundException when singleton farm does not exist", async () => {
      mockDb.setSelectResultsQueue([[]]);

      try {
        await service.createPlot({
          plotCode: "PLOT-A1",
          name: "Lô A1",
          areaSqm: 500,
        });
        expect.unreachable("Expected NotFoundException");
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toEqual({
          code: API_ERROR_CODES.FARM_NOT_FOUND,
          detail: MESSAGES.FARMS.NOT_FOUND,
        });
      }
    });
  });

  describe("deletePlot", () => {
    it("throws ConflictException when plot has planning or active seasons", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: plotId }],
        [{ id: "019fa8bc-8f4d-7000-b366-e691f45cfb99" }],
      ]);

      try {
        await service.deletePlot(plotId);
        expect.unreachable("Expected ConflictException");
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toEqual({
          code: API_ERROR_CODES.PLOT_HAS_ACTIVE_SEASONS,
          detail: MESSAGES.PLOTS.HAS_ACTIVE_SEASONS,
        });
      }
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });
});
