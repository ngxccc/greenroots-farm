import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Logger, NotFoundException } from "@nestjs/common";
import { BUSINESS_RULES, BatchStatus } from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import type { FarmSettingsService } from "@/modules/farms/farm-settings.service";
import type { TraceCacheService } from "@/modules/farms/trace-cache.service";
import { createMockDb } from "../../../test/mocks/mock-database";
import { BatchesExpiryService } from "./batches-expiry.service";
import {
  BATCH_EXPIRY_SWEEP_BATCH_SIZE,
  BATCH_EXPIRY_SWEEP_INTERVAL_MS,
} from "./inventory.constant";

type MockDb = ReturnType<typeof createMockDb> & {
  setSelectResultsQueue: (results: unknown[][]) => void;
  mockUpdateSet: ReturnType<typeof mock>;
};

describe("BatchesExpiryService", () => {
  let service: BatchesExpiryService;
  let mockDb: MockDb;
  let mockFarmSettingsService: {
    getSettings: ReturnType<typeof mock>;
  };
  let mockTraceCacheService: {
    invalidateByBatchCodes: ReturnType<typeof mock>;
  };
  let warnSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    warnSpy = spyOn(Logger.prototype, "warn").mockImplementation(
      () => undefined,
    );
    errorSpy = spyOn(Logger.prototype, "error").mockImplementation(
      () => undefined,
    );

    mockDb = createMockDb() as unknown as MockDb;
    mockFarmSettingsService = {
      getSettings: mock(() =>
        Promise.resolve({
          flashSaleConfig: {
            hoursThreshold: 48,
            discountPercent: 50,
          },
        }),
      ),
    };
    mockTraceCacheService = {
      invalidateByBatchCodes: mock(() => Promise.resolve()),
    };

    service = new BatchesExpiryService(
      mockDb,
      mockFarmSettingsService as unknown as FarmSettingsService,
      mockTraceCacheService as unknown as TraceCacheService,
    );
  });

  describe("onModuleInit", () => {
    it("suppresses the interval scheduler when NODE_ENV is test", () => {
      const originalSetInterval = globalThis.setInterval;
      const setIntervalMock = mock(() => ({
        unref: mock(() => undefined),
      }));
      globalThis.setInterval = setIntervalMock as unknown as typeof setInterval;

      try {
        expect(env.NODE_ENV).toBe("test");
        service.onModuleInit();
        expect(setIntervalMock).not.toHaveBeenCalled();
      } finally {
        globalThis.setInterval = originalSetInterval;
      }
    });

    it("registers an unrefed interval scheduler outside test environment", () => {
      const originalEnv = env.NODE_ENV;
      const originalSetInterval = globalThis.setInterval;
      const unrefMock = mock(() => undefined);
      const setIntervalMock = mock(() => ({
        unref: unrefMock,
      }));
      (env as { NODE_ENV: string }).NODE_ENV = "production";
      globalThis.setInterval = setIntervalMock as unknown as typeof setInterval;

      try {
        service.onModuleInit();
        expect(setIntervalMock).toHaveBeenCalledTimes(1);
        expect(setIntervalMock).toHaveBeenCalledWith(
          expect.any(Function),
          BATCH_EXPIRY_SWEEP_INTERVAL_MS,
        );
        expect(unrefMock).toHaveBeenCalledTimes(1);
      } finally {
        service.onModuleDestroy();
        globalThis.setInterval = originalSetInterval;
        (env as { NODE_ENV: string }).NODE_ENV = originalEnv;
      }
    });
  });

  describe("onModuleDestroy", () => {
    it("clears the active interval timer when destroyed", () => {
      const originalEnv = env.NODE_ENV;
      const originalSetInterval = globalThis.setInterval;
      const originalClearInterval = globalThis.clearInterval;
      const fakeTimer = { unref: mock(() => undefined) };
      const clearIntervalMock = mock(() => undefined);

      (env as { NODE_ENV: string }).NODE_ENV = "development";
      globalThis.setInterval = mock(
        () => fakeTimer,
      ) as unknown as typeof setInterval;
      globalThis.clearInterval = clearIntervalMock;

      try {
        service.onModuleInit();
        service.onModuleDestroy();
        expect(clearIntervalMock).toHaveBeenCalledWith(fakeTimer);
      } finally {
        globalThis.setInterval = originalSetInterval;
        globalThis.clearInterval = originalClearInterval;
        (env as { NODE_ENV: string }).NODE_ENV = originalEnv;
      }
    });
  });

  describe("runSweep", () => {
    // Invariant: INV-BEXP-1, INV-BEXP-2, INV-BEXP-5
    it("transitions expired and near-expiry batches and invalidates trace cache post-commit", async () => {
      const now = new Date("2026-11-27T10:00:00.000Z");
      const events: string[] = [];

      mockDb.setSelectResultsQueue([
        [
          { id: "batch-1", batchCode: "BATCH-20261125-TOM-AAA111" },
          { id: "batch-2", batchCode: "BATCH-20261126-TOM-BBB222" },
        ],
        [{ id: "batch-3", batchCode: "BATCH-20261126-TOM-CCC333" }],
      ]);

      (
        mockDb.transaction as unknown as ReturnType<typeof mock>
      ).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        events.push("tx:start");
        const result = await cb(mockDb);
        events.push("tx:commit");
        return result;
      });

      mockTraceCacheService.invalidateByBatchCodes.mockImplementation(
        (codes: readonly string[]) => {
          events.push(`invalidate:${codes.join(",")}`);
          return Promise.resolve();
        },
      );

      const result = await service.runSweep(now);

      expect(result).toEqual({ expired: 2, nearExpiry: 1 });
      expect(mockDb.mockUpdateSet).toHaveBeenNthCalledWith(1, {
        status: BatchStatus.EXPIRED,
        isFlashSale: false,
        flashSaleDiscountPercent: null,
        updatedAt: now,
      });
      expect(mockDb.mockUpdateSet).toHaveBeenNthCalledWith(2, {
        status: BatchStatus.NEAR_EXPIRY,
        updatedAt: now,
      });
      expect(events).toEqual([
        "tx:start",
        "tx:commit",
        "invalidate:BATCH-20261125-TOM-AAA111,BATCH-20261126-TOM-BBB222",
        "tx:start",
        "tx:commit",
        "invalidate:BATCH-20261126-TOM-CCC333",
      ]);
    });

    // Invariant: INV-BEXP-4
    it("processes multiple chunks when a pass reaches the batch size limit", async () => {
      const now = new Date("2026-11-27T10:00:00.000Z");
      const fullChunk = Array.from(
        { length: BATCH_EXPIRY_SWEEP_BATCH_SIZE },
        (_, idx) => ({
          id: `batch-${String(idx).padStart(4, "0")}`,
          batchCode: `BATCH-20261125-TOM-${idx}`,
        }),
      );

      mockDb.setSelectResultsQueue([
        fullChunk,
        [{ id: "batch-0500", batchCode: "BATCH-20261125-TOM-500" }],
        [],
      ]);

      const result = await service.runSweep(now);

      expect(result).toEqual({
        expired: BATCH_EXPIRY_SWEEP_BATCH_SIZE + 1,
        nearExpiry: 0,
      });
      expect(
        mockTraceCacheService.invalidateByBatchCodes,
      ).toHaveBeenCalledTimes(2);
    });

    // Invariant: INV-BEXP-3
    it("returns zero counts and skips cache invalidation when no batches qualify", async () => {
      mockDb.setSelectResultsQueue([[], []]);

      const result = await service.runSweep(
        new Date("2026-11-27T10:00:00.000Z"),
      );

      expect(result).toEqual({ expired: 0, nearExpiry: 0 });
      expect(mockDb.update).not.toHaveBeenCalled();
      expect(
        mockTraceCacheService.invalidateByBatchCodes,
      ).not.toHaveBeenCalled();
    });

    it("skips overlapping runs while a sweep is already in progress", async () => {
      let resolveFirst!: (value: unknown[]) => void;
      const txMock = mock(() => Promise.resolve([]));
      txMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve as (value: unknown[]) => void;
          }),
      );
      (
        mockDb as unknown as { transaction: ReturnType<typeof mock> }
      ).transaction = txMock;

      const firstRun = service.runSweep();
      const overlappingResult = await service.runSweep();

      expect(overlappingResult).toEqual({ expired: 0, nearExpiry: 0 });
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);

      resolveFirst([]);
      expect(await firstRun).toEqual({ expired: 0, nearExpiry: 0 });
    });

    // Invariant: INV-BEXP-5
    it("isolates Pass 1 expiry transitions from FarmSettings failure in production", async () => {
      const originalEnv = env.NODE_ENV;
      (env as { NODE_ENV: string }).NODE_ENV = "production";
      mockDb.setSelectResultsQueue([
        [{ id: "batch-1", batchCode: "BATCH-20261125-TOM-AAA111" }],
      ]);
      mockFarmSettingsService.getSettings.mockRejectedValueOnce(
        new NotFoundException("Farm settings not found"),
      );

      try {
        const result = await service.runSweep(
          new Date("2026-11-27T10:00:00.000Z"),
        );

        expect(result).toEqual({ expired: 1, nearExpiry: 0 });
        expect(
          mockTraceCacheService.invalidateByBatchCodes,
        ).toHaveBeenCalledTimes(1);
        expect(
          mockTraceCacheService.invalidateByBatchCodes,
        ).toHaveBeenCalledWith(["BATCH-20261125-TOM-AAA111"]);
      } finally {
        (env as { NODE_ENV: string }).NODE_ENV = originalEnv;
      }
    });

    it("falls back to default threshold in non-production when FarmSettings is missing", async () => {
      mockDb.setSelectResultsQueue([
        [],
        [{ id: "batch-2", batchCode: "BATCH-20261126-TOM-BBB222" }],
      ]);
      mockFarmSettingsService.getSettings.mockRejectedValueOnce(
        new NotFoundException("Farm settings not found"),
      );

      const now = new Date("2026-11-27T10:00:00.000Z");
      const result = await service.runSweep(now);

      expect(result).toEqual({ expired: 0, nearExpiry: 1 });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          `default ${BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD}h threshold`,
        ),
      );
      expect(mockTraceCacheService.invalidateByBatchCodes).toHaveBeenCalledWith(
        ["BATCH-20261126-TOM-BBB222"],
      );
    });

    it("skips Pass 2 and logs error when FarmSettings hoursThreshold is non-positive", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: "batch-1", batchCode: "BATCH-20261125-TOM-AAA111" }],
      ]);
      mockFarmSettingsService.getSettings.mockResolvedValueOnce({
        flashSaleConfig: {
          hoursThreshold: 0,
          discountPercent: 50,
        },
      });

      const result = await service.runSweep(
        new Date("2026-11-27T10:00:00.000Z"),
      );

      expect(result).toEqual({ expired: 1, nearExpiry: 0 });
      expect(mockDb.mockUpdateSet).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith(
        "Error occurred during near-expiry batch sweep",
        expect.any(String),
      );
    });

    // Invariant: INV-BEXP-5
    it("continues to Pass 2 when Pass 1 throws a database error", async () => {
      let callCount = 0;
      (
        mockDb.transaction as unknown as ReturnType<typeof mock>
      ).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        callCount += 1;
        if (callCount === 1) {
          throw new Error("Transient DB error");
        }
        return cb(mockDb);
      });

      mockDb.setSelectResultsQueue([
        [{ id: "batch-2", batchCode: "BATCH-20261126-TOM-BBB222" }],
      ]);

      const result = await service.runSweep(
        new Date("2026-11-27T10:00:00.000Z"),
      );

      expect(result).toEqual({ expired: 0, nearExpiry: 1 });
    });
  });
});
