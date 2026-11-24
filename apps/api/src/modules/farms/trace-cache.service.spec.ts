import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Logger } from "@nestjs/common";
import {
  BatchStatus,
  FarmingActionType,
  SeasonStatus,
} from "@greenroots/shared";
import type { RedisService } from "@/common/services/redis.service";
import { createMockDb } from "../../../test/mocks/mock-database";
import type { TraceRecordProjection } from "./dto";
import {
  TRACE_CACHE_PREFIX,
  TRACE_CACHE_TTL_SECONDS,
  TRACE_FARM_VERSION_KEY,
  TRACE_INVALIDATED_AT_PREFIX,
  TRACE_INVALIDATION_MARKER_TTL_SECONDS,
  TRACE_MISS_CACHE_PREFIX,
  TRACE_MISS_TTL_SECONDS,
} from "./farms.constant";
import { TraceCacheService } from "./trace-cache.service";

type MockDb = ReturnType<typeof createMockDb> & {
  setSelectResultsQueue: (results: unknown[][]) => void;
};

describe("TraceCacheService", () => {
  const sampleTrace: TraceRecordProjection = {
    batch: {
      id: "019fa8bc-8f4d-7000-b366-e691f45cfb90",
      batchCode: "BATCH-2026-TOM-01",
      harvestDate: "2026-11-09T21:00:00.000Z",
      expirationDate: "2026-11-18T21:00:00.000Z",
      status: BatchStatus.IN_STOCK,
    },
    product: {
      id: "019fa8bc-8f4d-7000-b366-e691f45cfb91",
      name: "Cà chua bi hữu cơ",
      slug: "ca-chua-bi-huu-co",
      unit: "kg",
      imageUrls: [],
    },
    farm: {
      name: "GreenRoots Farm",
      legalName: "Công ty TNHH Nông nghiệp Hữu cơ GreenRoots",
      tagline: null,
      address: "Bình Thạnh, TP.HCM",
      certificationUrl: null,
    },
    plot: {
      plotCode: "PLOT-A1",
      name: "Lô A1",
      areaSqm: 1200,
      soilTestResult: null,
      waterTestResult: null,
    },
    season: {
      id: "019fa8bc-8f4d-7000-b366-e691f45cfb92",
      seasonName: "Vụ Đông Xuân 2026",
      startDate: "2026-09-01",
      expectedHarvestDate: "2026-12-15",
      status: SeasonStatus.HARVESTED,
    },
    farmingLogs: [
      {
        id: "019fa8bc-8f4d-7000-b366-e691f45cfb93",
        actionType: FarmingActionType.SEEDING,
        description: "Gieo hạt",
        mediaUrls: [],
        recordedByName: "Kỹ sư An",
        correctsLogId: null,
        correctsLog: null,
        correctedBy: [],
        loggedAt: "2026-09-01T01:30:00.000Z",
      },
    ],
    totalLogCount: 1,
    logsTruncated: false,
  };

  let service: TraceCacheService;
  let mockDb: MockDb;
  let mockPipeline: {
    unlink: ReturnType<typeof mock>;
    set: ReturnType<typeof mock>;
    exec: ReturnType<typeof mock>;
  };
  let mockRedisClient: {
    mget: ReturnType<typeof mock>;
    get: ReturnType<typeof mock>;
    set: ReturnType<typeof mock>;
    eval: ReturnType<typeof mock>;
    pipeline: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    mockDb = createMockDb() as unknown as MockDb;
    mockPipeline = {
      unlink: mock(() => mockPipeline),
      set: mock(() => mockPipeline),
      exec: mock(() =>
        Promise.resolve([
          [null, 1],
          [null, "OK"],
        ]),
      ),
    };
    mockRedisClient = {
      mget: mock(() => Promise.resolve([null, null, null])),
      get: mock(() => Promise.resolve(null)),
      set: mock(() => Promise.resolve("OK")),
      eval: mock(() => Promise.resolve(1)),
      pipeline: mock(() => mockPipeline),
    };

    const mockRedisService = {
      getClient: () => mockRedisClient,
    } as unknown as RedisService;

    service = new TraceCacheService(mockDb, mockRedisService);
  });

  describe("readCachedTrace", () => {
    it("returns cache hit when envelope schema and farm version match", async () => {
      mockRedisClient.mget.mockResolvedValueOnce([
        `ver-1|${JSON.stringify(sampleTrace)}`,
        null,
        "ver-1",
      ]);

      const result = await service.readCachedTrace("BATCH-2026-TOM-01");

      expect(result).toEqual({ status: "hit", data: sampleTrace });
    });

    it("treats cached trace as a miss when farm epoch nonce changed", async () => {
      mockRedisClient.mget.mockResolvedValueOnce([
        `ver-old|${JSON.stringify(sampleTrace)}`,
        null,
        "ver-new",
      ]);

      const result = await service.readCachedTrace("BATCH-2026-TOM-01");

      expect(result).toEqual({ status: "miss", redisError: false });
    });

    it("treats malformed cached JSON as a clean miss rather than Redis outage", async () => {
      mockRedisClient.mget.mockResolvedValueOnce([
        "ver-1|{corrupt-json",
        null,
        "ver-1",
      ]);

      const result = await service.readCachedTrace("BATCH-2026-TOM-01");

      expect(result).toEqual({ status: "miss", redisError: false });
    });

    // Invariant: INV-TRACE-6
    it("returns negative hit when short-lived miss marker exists", async () => {
      mockRedisClient.mget.mockResolvedValueOnce([null, "1", "ver-1"]);

      const result = await service.readCachedTrace("BATCH-MISSING");

      expect(result).toEqual({ status: "negative_hit" });
    });

    // Invariant: INV-TRACE-6
    it("fails open to database miss when Redis raises an error", async () => {
      mockRedisClient.mget.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const result = await service.readCachedTrace("BATCH-2026-TOM-01");

      expect(result).toEqual({ status: "miss", redisError: true });
    });
  });

  describe("ensureFarmVersion", () => {
    it("initializes an opaque UUID epoch with NX when missing", async () => {
      mockRedisClient.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce("019fa8bc-8f4d-7000-b366-e691f45cfb99");

      const version = await service.ensureFarmVersion();

      expect(version).toBe("019fa8bc-8f4d-7000-b366-e691f45cfb99");
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        TRACE_FARM_VERSION_KEY,
        expect.any(String),
        "NX",
      );
    });
  });

  describe("backfillTrace and writeNegativeCache", () => {
    it("passes trace key, invalidation guard key, farm epoch key, and TTL to Lua backfill", async () => {
      await service.backfillTrace(
        "BATCH-2026-TOM-01",
        "ver-1",
        sampleTrace,
        1700000000000,
      );

      expect(mockRedisClient.eval).toHaveBeenCalledWith(
        expect.any(String),
        3,
        `${TRACE_CACHE_PREFIX}BATCH-2026-TOM-01`,
        `${TRACE_INVALIDATED_AT_PREFIX}BATCH-2026-TOM-01`,
        TRACE_FARM_VERSION_KEY,
        `ver-1|${JSON.stringify(sampleTrace)}`,
        "1700000000000",
        String(TRACE_CACHE_TTL_SECONDS),
        "ver-1",
      );
    });

    it("stores negative miss marker with 30-second TTL", async () => {
      await service.writeNegativeCache("BATCH-UNKNOWN");

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `${TRACE_MISS_CACHE_PREFIX}BATCH-UNKNOWN`,
        "1",
        "EX",
        TRACE_MISS_TTL_SECONDS,
      );
    });
  });

  describe("invalidation operations", () => {
    // Invariant: INV-TRACE-5
    it("deduplicates codes and pipelines UNLINK for positive and negative keys with invalidation marker", async () => {
      await service.invalidateByBatchCodes([
        " batch-2026-tom-01 ",
        "BATCH-2026-TOM-01",
        "",
      ]);

      expect(mockPipeline.unlink).toHaveBeenCalledTimes(2);
      expect(mockPipeline.unlink).toHaveBeenCalledWith(
        `${TRACE_CACHE_PREFIX}BATCH-2026-TOM-01`,
        `${TRACE_MISS_CACHE_PREFIX}BATCH-2026-TOM-01`,
      );
      expect(mockPipeline.set).toHaveBeenCalledWith(
        `${TRACE_INVALIDATED_AT_PREFIX}BATCH-2026-TOM-01`,
        expect.any(String),
        "EX",
        TRACE_INVALIDATION_MARKER_TTL_SECONDS,
      );
      expect(mockPipeline.exec).toHaveBeenCalledTimes(1);
    });

    it("invalidates all batches belonging to a season or plot", async () => {
      mockDb.setSelectResultsQueue([
        [{ batchCode: "BATCH-1" }, { batchCode: "BATCH-2" }],
        [{ batchCode: "BATCH-3" }],
      ]);

      await service.invalidateBySeasonId(
        "019fa8bc-8f4d-7000-b366-e691f45cfb92",
      );
      await service.invalidateByPlotId("019fa8bc-8f4d-7000-b366-e691f45cfb94");

      expect(mockPipeline.unlink).toHaveBeenCalledTimes(5);
    });

    it("rotates the farm epoch key with a fresh UUID nonce", async () => {
      await service.rotateFarmVersion();

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        TRACE_FARM_VERSION_KEY,
        expect.stringMatching(/^[0-9a-f-]{36}$/i),
      );
    });
  });

  describe("recent batches cache", () => {
    it("reads and parses cached recent batches when valid", async () => {
      const recent = [
        {
          batchCode: "BATCH-2026-TOM-01",
          harvestDate: "2026-11-20T04:15:00.000Z",
          status: BatchStatus.IN_STOCK,
          product: {
            name: "Cà chua bi",
            unit: "500g",
            imageUrls: [],
          },
          plot: {
            plotCode: "PLOT-B2",
            name: "Nhà màng B2",
          },
        },
      ];
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(recent));

      const result = await service.readCachedRecentBatches(4);

      expect(result).toEqual(recent);
    });

    it("fails open to null when Redis throws during recent batches read", async () => {
      mockRedisClient.get.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const result = await service.readCachedRecentBatches(4);

      expect(result).toBeNull();
    });

    it("writes recent batches to Redis with 60-second TTL", async () => {
      const recent = [
        {
          batchCode: "BATCH-2026-TOM-01",
          harvestDate: "2026-11-20T04:15:00.000Z",
          status: BatchStatus.IN_STOCK,
          product: {
            name: "Cà chua bi",
            unit: "500g",
            imageUrls: [],
          },
          plot: {
            plotCode: "PLOT-B2",
            name: "Nhà màng B2",
          },
        },
      ];

      await service.writeCachedRecentBatches(4, recent);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        "trace:recent:v1:4",
        JSON.stringify(recent),
        "EX",
        60,
      );
    });
  });
});
