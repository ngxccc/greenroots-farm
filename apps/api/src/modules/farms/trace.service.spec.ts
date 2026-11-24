import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Logger, NotFoundException } from "@nestjs/common";
import {
  API_ERROR_CODES,
  BatchStatus,
  FarmingActionType,
  SeasonStatus,
} from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import { createMockDb } from "../../../test/mocks/mock-database";
import type { TraceCacheService } from "./trace-cache.service";
import { TraceService } from "./trace.service";

type MockDb = ReturnType<typeof createMockDb> & {
  setSelectResultsQueue: (results: unknown[][]) => void;
};

describe("TraceService", () => {
  const batchId = "019fa8bc-8f4d-7000-b366-e691f45cfb90";
  const productId = "019fa8bc-8f4d-7000-b366-e691f45cfb91";
  const seasonId = "019fa8bc-8f4d-7000-b366-e691f45cfb92";

  const sampleProvenanceRow = {
    batch: {
      id: batchId,
      batchCode: "BATCH-2026-TOM-01",
      harvestDate: new Date("2026-11-10T04:00:00+07:00"),
      expirationDate: new Date("2026-11-19T04:00:00+07:00"),
      status: BatchStatus.IN_STOCK,
    },
    product: {
      id: productId,
      name: "Cà chua bi hữu cơ",
      slug: "ca-chua-bi-huu-co",
      unit: "kg",
      imageUrls: null,
    },
    season: {
      id: seasonId,
      seasonName: "Vụ Đông Xuân 2026",
      startDate: "2026-09-01",
      expectedHarvestDate: "2026-12-15",
      status: SeasonStatus.HARVESTED,
    },
    plot: {
      plotCode: "PLOT-B2",
      name: "Lô B2",
      areaSqm: "800.00",
      soilTestResult: null,
      waterTestResult: null,
    },
    farm: {
      name: "GreenRoots Farm",
      legalName: "Công ty TNHH Nông nghiệp Hữu cơ GreenRoots",
      tagline: null,
      address: "Bình Thạnh, TP.HCM",
      certificationUrl: null,
    },
  };

  let service: TraceService;
  let mockDb: MockDb;
  let mockTraceCacheService: {
    readCachedTrace: ReturnType<typeof mock>;
    ensureFarmVersion: ReturnType<typeof mock>;
    backfillTrace: ReturnType<typeof mock>;
    writeNegativeCache: ReturnType<typeof mock>;
    readCachedRecentBatches: ReturnType<typeof mock>;
    writeCachedRecentBatches: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    spyOn(Logger.prototype, "debug").mockImplementation(() => undefined);

    mockDb = createMockDb() as unknown as MockDb;
    mockTraceCacheService = {
      readCachedTrace: mock(() =>
        Promise.resolve({ status: "miss" as const, redisError: false }),
      ),
      ensureFarmVersion: mock(() => Promise.resolve("farm-ver-1")),
      backfillTrace: mock(() => Promise.resolve()),
      writeNegativeCache: mock(() => Promise.resolve()),
      readCachedRecentBatches: mock(() => Promise.resolve(null)),
      writeCachedRecentBatches: mock(() => Promise.resolve()),
    };

    service = new TraceService(
      mockDb,
      mockTraceCacheService as unknown as TraceCacheService,
    );
  });

  // Invariant: INV-TRACE-2
  it("preserves nullable telemetry and normalizes empty product imageUrls on cache miss", async () => {
    mockDb.setSelectResultsQueue([[sampleProvenanceRow], []]);

    const result = await service.getTraceByBatchCode("BATCH-2026-TOM-01");

    expect(result.plot.soilTestResult).toBeNull();
    expect(result.plot.waterTestResult).toBeNull();
    expect(result.farm.certificationUrl).toBeNull();
    expect(result.product.imageUrls).toEqual([]);
    expect(result.farmingLogs).toEqual([]);
    expect(result.totalLogCount).toBe(0);
    expect(result.logsTruncated).toBe(false);
    expect(mockTraceCacheService.backfillTrace).toHaveBeenCalledTimes(1);
  });

  // Invariant: INV-TRACE-4
  it("truncates to the latest 200 logs and reverses them into ascending chronological order", async () => {
    const newestLog = {
      totalCount: 205,
      log: {
        id: "019fa8bc-8f4d-7000-b366-e691f45cf205",
        actionType: FarmingActionType.CORRECTION,
        description: "Latest correction",
        mediaUrls: null,
        correctsLogId: "019fa8bc-8f4d-7000-b366-e691f45cf001",
        loggedAt: new Date("2026-11-11T08:00:00.000Z"),
      },
      recordedByName: "Kỹ sư Bình",
      targetLog: {
        id: "019fa8bc-8f4d-7000-b366-e691f45cf001",
        actionType: FarmingActionType.SEEDING,
        description: "Original log outside window",
        loggedAt: new Date("2026-09-01T01:00:00.000Z"),
      },
    };
    const earlierInWindow = {
      totalCount: 205,
      log: {
        id: "019fa8bc-8f4d-7000-b366-e691f45cf006",
        actionType: FarmingActionType.HARVESTING,
        description: "Harvest entry",
        mediaUrls: [
          "https://res.cloudinary.com/demo/image/upload/v1/farming_logs/a.webp",
        ],
        correctsLogId: null,
        loggedAt: new Date("2026-11-10T05:00:00.000Z"),
      },
      recordedByName: "Kỹ sư An",
      targetLog: null,
    };

    mockDb.setSelectResultsQueue([
      [sampleProvenanceRow],
      [newestLog, earlierInWindow],
      [],
    ]);

    const result = await service.getTraceByBatchCode("BATCH-2026-TOM-01");

    expect(result.totalLogCount).toBe(205);
    expect(result.logsTruncated).toBe(true);
    expect(result.farmingLogs.map((l) => l.id)).toEqual([
      earlierInWindow.log.id,
      newestLog.log.id,
    ]);
    expect(result.farmingLogs[1]?.correctsLog?.id).toBe(
      "019fa8bc-8f4d-7000-b366-e691f45cf001",
    );
  });

  // Invariant: INV-TRACE-6
  it("writes negative cache and throws not found when batch code is absent", async () => {
    mockDb.setSelectResultsQueue([[]]);

    try {
      await service.getTraceByBatchCode("BATCH-UNKNOWN");
      expect.unreachable("Expected NotFoundException");
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundException);
      expect((error as NotFoundException).getResponse()).toEqual({
        code: API_ERROR_CODES.BATCH_NOT_FOUND,
        detail: MESSAGES.BATCHES.NOT_FOUND,
      });
    }

    expect(mockTraceCacheService.writeNegativeCache).toHaveBeenCalledWith(
      "BATCH-UNKNOWN",
    );
  });

  it("throws not found directly without querying database on negative cache hit", async () => {
    mockTraceCacheService.readCachedTrace.mockResolvedValueOnce({
      status: "negative_hit",
    });

    try {
      await service.getTraceByBatchCode("BATCH-UNKNOWN");
      expect.unreachable("Expected NotFoundException");
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundException);
    }

    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("coalesces concurrent cache-miss reads for the same batch code into one DB query", async () => {
    let releaseFarmVersion!: (val: string) => void;
    mockTraceCacheService.ensureFarmVersion.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          releaseFarmVersion = resolve;
        }),
    );
    mockDb.setSelectResultsQueue([[sampleProvenanceRow], []]);

    const first = service.getTraceByBatchCode("BATCH-2026-TOM-01");
    const second = service.getTraceByBatchCode("BATCH-2026-TOM-01");

    await Promise.resolve();
    releaseFarmVersion("farm-ver-1");

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual(secondResult);
    expect(mockTraceCacheService.ensureFarmVersion).toHaveBeenCalledTimes(1);
    expect(mockDb.select).toHaveBeenCalledTimes(2);
  });

  describe("listRecentTraceBatches", () => {
    it("returns cached recent batches without querying PostgreSQL on cache hit", async () => {
      const cached = [
        {
          batchCode: "BATCH-2026-TOM-01",
          harvestDate: "2026-11-20T04:15:00.000Z",
          status: BatchStatus.IN_STOCK,
          product: {
            name: "Cà chua bi hữu cơ",
            unit: "500g",
            imageUrls: ["https://res.cloudinary.com/demo/tom.jpg"],
          },
          plot: {
            plotCode: "PLOT-B2",
            name: "Nhà màng B2",
          },
        },
      ];
      mockTraceCacheService.readCachedRecentBatches.mockResolvedValueOnce(
        cached,
      );

      const result = await service.listRecentTraceBatches(4);

      expect(result).toEqual(cached);
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it("queries PostgreSQL and backfills cache on cache miss", async () => {
      mockDb.setSelectResultsQueue([
        [
          {
            batchCode: "BATCH-2026-TOM-01",
            harvestDate: new Date("2026-11-20T04:15:00.000Z"),
            status: BatchStatus.IN_STOCK,
            productName: "Cà chua bi hữu cơ",
            productUnit: "500g",
            productImageUrls: null,
            plotCode: "PLOT-B2",
            plotName: "Nhà màng B2",
          },
        ],
      ]);

      const result = await service.listRecentTraceBatches(4);

      expect(result).toEqual([
        {
          batchCode: "BATCH-2026-TOM-01",
          harvestDate: "2026-11-20T04:15:00.000Z",
          status: BatchStatus.IN_STOCK,
          product: {
            name: "Cà chua bi hữu cơ",
            unit: "500g",
            imageUrls: [],
          },
          plot: {
            plotCode: "PLOT-B2",
            name: "Nhà màng B2",
          },
        },
      ]);
      expect(
        mockTraceCacheService.writeCachedRecentBatches,
      ).toHaveBeenCalledWith(4, result);
    });

    it("coalesces concurrent recent batch cache misses into a single database query", async () => {
      let releaseDb!: (rows: unknown[]) => void;
      mockDb.setSelectResultsQueue([[]]);
      const originalSelect = mockDb.select;
      let selectCalls = 0;
      mockDb.select = (() => {
        selectCalls += 1;
        return {
          from: () => ({
            innerJoin: () => ({
              innerJoin: () => ({
                innerJoin: () => ({
                  where: () => ({
                    orderBy: () => ({
                      limit: () =>
                        new Promise((resolve) => {
                          releaseDb = resolve;
                        }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }) as unknown as typeof mockDb.select;

      const first = service.listRecentTraceBatches(4);
      const second = service.listRecentTraceBatches(4);

      await Promise.resolve();
      releaseDb([
        {
          batchCode: "BATCH-2026-TOM-01",
          harvestDate: new Date("2026-11-20T04:15:00.000Z"),
          status: BatchStatus.IN_STOCK,
          productName: "Cà chua bi",
          productUnit: "500g",
          productImageUrls: [],
          plotCode: "PLOT-B2",
          plotName: "Nhà màng B2",
        },
      ]);

      const [firstRes, secondRes] = await Promise.all([first, second]);
      mockDb.select = originalSelect;

      expect(selectCalls).toBe(1);
      expect(firstRes).toEqual(secondRes);
    });
  });
});
