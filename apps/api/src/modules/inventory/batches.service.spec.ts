import {
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
  spyOn,
} from "bun:test";
import {
  ConflictException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  API_ERROR_CODES,
  BUSINESS_RULES,
  BatchStatus,
  SeasonStatus,
} from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import { TIME_IN_MS } from "@/common/constants/time.constant";
import { formatVnCalendarDate } from "@/common/utils/time.util";
import type { FarmSettingsService } from "@/modules/farms/farm-settings.service";
import { BATCH_CODE_REGEX } from "@/modules/farms/farms.constant";
import type { TraceCacheService } from "@/modules/farms/trace-cache.service";
import { createMockDb } from "../../../test/mocks/mock-database";
import { BatchesService } from "./batches.service";

type MockDb = ReturnType<typeof createMockDb> & {
  setSelectResultsQueue: (results: unknown[][]) => void;
  mockInsertValues: ReturnType<typeof mock>;
};

describe("BatchesService", () => {
  const productId = "019fa8bc-8f4d-7000-b366-e691f45cfb10";
  const seasonId = "019fa8bc-8f4d-7000-b366-e691f45cfb20";
  const plotId = "019fa8bc-8f4d-7000-b366-e691f45cfb30";
  const batchId = "019fa8bc-8f4d-7000-b366-e691f45cfb40";

  const sampleProduct = {
    id: productId,
    name: "Cà chua bi hữu cơ",
    slug: "ca-chua-bi-huu-co",
    unit: "kg",
  };

  const sampleSeason = {
    id: seasonId,
    seasonName: "Vụ Đông Xuân 2026",
    plotId,
    startDate: "2026-09-01",
    status: SeasonStatus.ACTIVE,
  };

  let service: BatchesService;
  let mockDb: MockDb;
  let mockFarmSettingsService: {
    getSettings: ReturnType<typeof mock>;
  };
  let mockTraceCacheService: {
    invalidateByBatchCodes: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

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

    service = new BatchesService(
      mockDb,
      mockFarmSettingsService as unknown as FarmSettingsService,
      mockTraceCacheService as unknown as TraceCacheService,
    );
  });

  describe("createBatch", () => {
    it("computes expirationDate as harvestDate plus shelfLifeDays * 24h and classifies in_stock when remaining >= threshold", async () => {
      // Invariant: INV-BATCH-2, INV-BATCH-3, INV-BATCH-DROP-1
      const nowMs = Date.now();
      const harvest = new Date(nowMs - 2 * TIME_IN_MS.HOUR);
      const shelfLifeDays = 3; // 70h remaining >= 48h threshold
      const expectedExpiration = new Date(
        harvest.getTime() + shelfLifeDays * TIME_IN_MS.DAY,
      );

      mockDb.setSelectResultsQueue([
        [sampleProduct],
        [sampleSeason],
        [
          {
            id: batchId,
            batchCode: "BATCH-20261120-CACHUA-7K9M2P",
            productId,
            seasonId,
            harvestDate: harvest,
            expirationDate: expectedExpiration,
            initialQuantity: "25.50",
            availableQuantity: "25.50",
            status: BatchStatus.IN_STOCK,
            createdAt: new Date(nowMs),
            updatedAt: new Date(nowMs),
          },
        ],
      ]);

      const result = await service.createBatch({
        productId,
        seasonId,
        harvestDate: harvest.toISOString(),
        shelfLifeDays,
        initialQuantity: 25.5,
      });

      expect(result.status).toBe(BatchStatus.IN_STOCK);
      expect(result.initialQuantity).toBe(25.5);
      expect(result.availableQuantity).toBe(25.5);
      expect("qrCodeUrl" in result).toBe(false);
      expect(result.expirationDate).toBe(expectedExpiration.toISOString());
      expect(mockTraceCacheService.invalidateByBatchCodes).toHaveBeenCalledWith(
        ["BATCH-20261120-CACHUA-7K9M2P"],
      );
    });

    it("classifies exact 48h remaining as in_stock and 48h - 1ms remaining as near_expiry", async () => {
      // Invariant: INV-BATCH-3
      const fixedNow = new Date("2026-11-20T04:00:00.000Z");
      try {
        setSystemTime(fixedNow);

        // Exact 48h remaining (harvested 24h ago with 3d shelf life = +48h00m00s) -> in_stock
        const exactHarvest = new Date(fixedNow.getTime() - TIME_IN_MS.DAY);
        const exactExpiration = new Date(
          exactHarvest.getTime() + 3 * TIME_IN_MS.DAY,
        );
        mockDb.setSelectResultsQueue([
          [sampleProduct],
          [sampleSeason],
          [
            {
              id: batchId,
              batchCode: "BATCH-20261119-CACHUA-EXACT1",
              productId,
              seasonId,
              harvestDate: exactHarvest,
              expirationDate: exactExpiration,
              initialQuantity: "10.00",
              availableQuantity: "10.00",
              status: BatchStatus.IN_STOCK,
              createdAt: fixedNow,
              updatedAt: fixedNow,
            },
          ],
        ]);

        await service.createBatch({
          productId,
          seasonId,
          harvestDate: exactHarvest.toISOString(),
          shelfLifeDays: 3,
          initialQuantity: 10,
        });

        const firstInsertPayload = mockDb.mockInsertValues.mock
          .calls[0]?.[0] as { status: BatchStatus };
        expect(firstInsertPayload.status).toBe(BatchStatus.IN_STOCK);

        // 48h - 1ms remaining -> near_expiry
        const underHarvest = new Date(fixedNow.getTime() - TIME_IN_MS.DAY - 1);
        const underExpiration = new Date(
          underHarvest.getTime() + 3 * TIME_IN_MS.DAY,
        );
        mockDb.setSelectResultsQueue([
          [sampleProduct],
          [sampleSeason],
          [
            {
              id: batchId,
              batchCode: "BATCH-20261119-CACHUA-UNDER1",
              productId,
              seasonId,
              harvestDate: underHarvest,
              expirationDate: underExpiration,
              initialQuantity: "10.00",
              availableQuantity: "10.00",
              status: BatchStatus.NEAR_EXPIRY,
              createdAt: fixedNow,
              updatedAt: fixedNow,
            },
          ],
        ]);

        await service.createBatch({
          productId,
          seasonId,
          harvestDate: underHarvest.toISOString(),
          shelfLifeDays: 3,
          initialQuantity: 10,
        });

        const secondInsertPayload = mockDb.mockInsertValues.mock
          .calls[1]?.[0] as { status: BatchStatus };
        expect(secondInsertPayload.status).toBe(BatchStatus.NEAR_EXPIRY);
      } finally {
        setSystemTime();
      }
    });

    it("generates Crockford Base32 batch codes matching BATCH_CODE_REGEX", () => {
      // Invariant: INV-BATCH-1
      const helper = service as unknown as {
        buildBatchCode: (yyyymmdd: string, slug: string) => string;
      };

      const code = helper.buildBatchCode("20261120", "ca-chua-bi-huu-co");
      expect(code).toMatch(/^BATCH-20261120-CACHUA-[0-9A-HJKMNPQRSTVWXYZ]{6}$/);
      expect(BATCH_CODE_REGEX.test(code)).toBe(true);

      const fallbackCode = helper.buildBatchCode("20261120", "---");
      expect(fallbackCode).toMatch(
        /^BATCH-20261120-ITEM-[0-9A-HJKMNPQRSTVWXYZ]{6}$/,
      );
    });

    it("retries up to 3 times on PG 23505 batches_batch_code_uidx collisions and succeeds on a later attempt", async () => {
      // Invariant: INV-BATCH-1
      const nowMs = Date.now();
      const harvest = new Date(nowMs - TIME_IN_MS.HOUR);
      const expiration = new Date(harvest.getTime() + 2 * TIME_IN_MS.DAY);

      mockDb.setSelectResultsQueue([
        [sampleProduct],
        [sampleSeason],
        [sampleProduct],
        [sampleSeason],
        [
          {
            id: batchId,
            batchCode: "BATCH-20261120-CACHUA-RETRY2",
            productId,
            seasonId,
            harvestDate: harvest,
            expirationDate: expiration,
            initialQuantity: "12.00",
            availableQuantity: "12.00",
            status: BatchStatus.NEAR_EXPIRY,
            createdAt: new Date(nowMs),
            updatedAt: new Date(nowMs),
          },
        ],
      ]);

      mockDb.mockInsertValues.mockImplementationOnce(() => ({
        returning: () =>
          Promise.reject(
            Object.assign(new Error("duplicate"), {
              code: PG_ERROR_CODE.UNIQUE_VIOLATION,
              constraint: "batches_batch_code_uidx",
            }),
          ),
      }));

      const result = await service.createBatch({
        productId,
        seasonId,
        harvestDate: harvest.toISOString(),
        shelfLifeDays: 2,
        initialQuantity: 12,
      });

      expect(result.batchCode).toBe("BATCH-20261120-CACHUA-RETRY2");
      expect(mockDb.transaction).toHaveBeenCalledTimes(2);
    });

    it("throws ConflictException when all 3 batchCode generation attempts collide", async () => {
      // Invariant: INV-BATCH-1
      const nowMs = Date.now();
      const harvest = new Date(nowMs - TIME_IN_MS.HOUR);

      mockDb.setSelectResultsQueue([
        [sampleProduct],
        [sampleSeason],
        [sampleProduct],
        [sampleSeason],
        [sampleProduct],
        [sampleSeason],
      ]);

      for (let i = 0; i < 3; i += 1) {
        mockDb.mockInsertValues.mockImplementationOnce(() => ({
          returning: () =>
            Promise.reject(
              Object.assign(new Error("duplicate"), {
                code: PG_ERROR_CODE.UNIQUE_VIOLATION,
                constraint: "batches_batch_code_uidx",
              }),
            ),
        }));
      }

      try {
        await service.createBatch({
          productId,
          seasonId,
          harvestDate: harvest.toISOString(),
          shelfLifeDays: 3,
          initialQuantity: 5,
        });
        expect.unreachable("Expected ConflictException");
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        expect((error as ConflictException).getResponse()).toEqual({
          code: API_ERROR_CODES.CONCURRENCY_CONFLICT,
          detail: MESSAGES.BATCHES.CODE_GENERATION_EXHAUSTED,
        });
      }
    });

    it("rejects future harvestDate and already-expired batches at intake", async () => {
      // Invariant: INV-BATCH-2
      const futureHarvest = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      try {
        await service.createBatch({
          productId,
          seasonId,
          harvestDate: futureHarvest,
          shelfLifeDays: 2,
          initialQuantity: 5,
        });
        expect.unreachable("Expected UnprocessableEntityException");
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual({
          code: API_ERROR_CODES.BATCH_HARVEST_DATE_INVALID,
          detail: MESSAGES.BATCHES.HARVEST_IN_FUTURE,
        });
      }

      const staleHarvest = new Date(
        Date.now() - 4 * TIME_IN_MS.DAY,
      ).toISOString();
      try {
        await service.createBatch({
          productId,
          seasonId,
          harvestDate: staleHarvest,
          shelfLifeDays: 3,
          initialQuantity: 5,
        });
        expect.unreachable("Expected UnprocessableEntityException");
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual({
          code: API_ERROR_CODES.BATCH_EXPIRED_AT_INTAKE,
          detail: MESSAGES.BATCHES.EXPIRED_AT_INTAKE,
        });
      }
    });

    it("accepts 04:00+07:00 harvest on season startDate despite earlier UTC calendar date", async () => {
      // Invariant: INV-BATCH-5
      const sameDayVnFourAm = new Date("2026-09-01T04:00:00+07:00");
      expect(sameDayVnFourAm.toISOString()).toBe("2026-08-31T21:00:00.000Z");

      // Anchor clock via a season starting today in Asia/Ho_Chi_Minh at 00:00+07:00
      const now = new Date();
      const todayVn = formatVnCalendarDate(now);
      const fourAmTodayVn = new Date(`${todayVn}T04:00:00+07:00`);
      const testHarvest =
        fourAmTodayVn.getTime() <= now.getTime()
          ? fourAmTodayVn
          : new Date(now.getTime() - 1000);
      const testHarvestVnDate = formatVnCalendarDate(testHarvest);
      const expiration = new Date(testHarvest.getTime() + 4 * TIME_IN_MS.DAY);

      mockDb.setSelectResultsQueue([
        [sampleProduct],
        [{ ...sampleSeason, startDate: testHarvestVnDate }],
        [
          {
            id: batchId,
            batchCode: "BATCH-20261120-CACHUA-VN04AM",
            productId,
            seasonId,
            harvestDate: testHarvest,
            expirationDate: expiration,
            initialQuantity: "15.00",
            availableQuantity: "15.00",
            status: BatchStatus.IN_STOCK,
            createdAt: now,
            updatedAt: now,
          },
        ],
      ]);

      const result = await service.createBatch({
        productId,
        seasonId,
        harvestDate: testHarvest.toISOString(),
        shelfLifeDays: 4,
        initialQuantity: 15,
      });

      expect(result.batchCode).toBe("BATCH-20261120-CACHUA-VN04AM");
    });

    it("falls back to BUSINESS_RULES threshold in test/dev when farm settings are missing but fails closed in production", async () => {
      // Invariant: INV-BATCH-3
      mockFarmSettingsService.getSettings.mockImplementation(() =>
        Promise.reject(
          new NotFoundException({
            code: API_ERROR_CODES.FARM_NOT_FOUND,
            detail: MESSAGES.FARMS.NOT_FOUND,
          }),
        ),
      );

      const nowMs = Date.now();
      const harvest = new Date(nowMs - TIME_IN_MS.HOUR);
      const expiration = new Date(
        harvest.getTime() +
          (BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD + 24) * TIME_IN_MS.HOUR,
      );

      mockDb.setSelectResultsQueue([
        [sampleProduct],
        [sampleSeason],
        [
          {
            id: batchId,
            batchCode: "BATCH-20261120-CACHUA-FALLBK",
            productId,
            seasonId,
            harvestDate: harvest,
            expirationDate: expiration,
            initialQuantity: "8.00",
            availableQuantity: "8.00",
            status: BatchStatus.IN_STOCK,
            createdAt: new Date(nowMs),
            updatedAt: new Date(nowMs),
          },
        ],
      ]);

      const devResult = await service.createBatch({
        productId,
        seasonId,
        harvestDate: harvest.toISOString(),
        shelfLifeDays: 3,
        initialQuantity: 8,
      });
      expect(devResult.status).toBe(BatchStatus.IN_STOCK);

      const originalEnv = env.NODE_ENV;
      try {
        (env as { NODE_ENV: string }).NODE_ENV = "production";
        try {
          await service.createBatch({
            productId,
            seasonId,
            harvestDate: harvest.toISOString(),
            shelfLifeDays: 3,
            initialQuantity: 8,
          });
          expect.unreachable("Expected NotFoundException");
        } catch (error) {
          expect(error).toBeInstanceOf(NotFoundException);
        }
      } finally {
        (env as { NODE_ENV: string }).NODE_ENV = originalEnv;
      }
    });

    it("rejects non-positive flashSaleConfig.hoursThreshold across all environments", async () => {
      // Invariant: INV-BATCH-3
      mockFarmSettingsService.getSettings.mockImplementation(() =>
        Promise.resolve({
          flashSaleConfig: {
            hoursThreshold: 0,
            discountPercent: 50,
          },
        }),
      );

      const harvest = new Date(Date.now() - TIME_IN_MS.HOUR);

      try {
        await service.createBatch({
          productId,
          seasonId,
          harvestDate: harvest.toISOString(),
          shelfLifeDays: 2,
          initialQuantity: 5,
        });
        expect.unreachable("Expected UnprocessableEntityException");
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual({
          code: API_ERROR_CODES.FARM_FLASH_SALE_CONFIG_INVALID,
          detail: MESSAGES.FARMS.FLASH_SALE_CONFIG_INVALID,
        });
      }
    });
  });

  describe("listBatches", () => {
    it("computes pagination metadata in (total, page, limit) order even when page yields empty rows", async () => {
      mockDb.setSelectResultsQueue([[{ total: 25 }], []]);

      const result = await service.listBatches({
        page: 3,
        limit: 10,
        sort: "createdAt:desc",
      });

      expect(result.items).toEqual([]);
      expect(result.meta).toEqual({
        page: 3,
        limit: 10,
        total: 25,
        totalPages: 3,
        hasNextPage: false,
        hasPrevPage: true,
      });
    });
  });

  describe("getBatchById", () => {
    it("throws NotFoundException when batch does not exist", async () => {
      mockDb.setSelectResultsQueue([[]]);

      try {
        await service.getBatchById(batchId);
        expect.unreachable("Expected NotFoundException");
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toEqual({
          code: API_ERROR_CODES.BATCH_NOT_FOUND,
          detail: MESSAGES.BATCHES.NOT_FOUND,
        });
      }
    });
  });

  describe("getBatchQrLabel", () => {
    it("returns deterministic traceUrl and labelPayload derived from env.STOREFRONT_URL", async () => {
      // Invariant: INV-QR-LABEL-2, INV-QR-LABEL-4
      const harvestDate = new Date("2026-11-20T04:00:00.000Z");
      const expirationDate = new Date("2026-11-23T04:00:00.000Z");
      const row = {
        batchCode: "BATCH-20261120-CACHUA-7K9M2P",
        harvestDate,
        expirationDate,
        productName: "Cà chua bi hữu cơ",
        unit: "kg",
      };

      const originalStorefrontUrl = env.STOREFRONT_URL;
      try {
        (env as { STOREFRONT_URL: string }).STOREFRONT_URL =
          "https://greenroots.farm/";
        mockDb.setSelectResultsQueue([[row], [row]]);

        const first = await service.getBatchQrLabel(batchId);
        const second = await service.getBatchQrLabel(batchId);

        expect(first).toEqual({
          batchCode: "BATCH-20261120-CACHUA-7K9M2P",
          traceUrl:
            "https://greenroots.farm/trace/BATCH-20261120-CACHUA-7K9M2P",
          labelPayload: {
            batchCode: "BATCH-20261120-CACHUA-7K9M2P",
            productName: "Cà chua bi hữu cơ",
            unit: "kg",
            harvestDate: harvestDate.toISOString(),
            expirationDate: expirationDate.toISOString(),
            qrValue:
              "https://greenroots.farm/trace/BATCH-20261120-CACHUA-7K9M2P",
          },
        });
        expect(second).toEqual(first);
      } finally {
        (env as { STOREFRONT_URL: string }).STOREFRONT_URL =
          originalStorefrontUrl;
      }
    });

    it("throws NotFoundException when batch does not exist", async () => {
      // Invariant: INV-QR-LABEL-3
      mockDb.setSelectResultsQueue([[]]);

      try {
        await service.getBatchQrLabel(batchId);
        expect.unreachable("Expected NotFoundException");
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toEqual({
          code: API_ERROR_CODES.BATCH_NOT_FOUND,
          detail: MESSAGES.BATCHES.NOT_FOUND,
        });
      }
    });

    it("fails closed in production when STOREFRONT_URL resolves to localhost or non-HTTPS", async () => {
      // Invariant: INV-QR-LABEL-1
      const row = {
        batchCode: "BATCH-20261120-CACHUA-7K9M2P",
        harvestDate: new Date("2026-11-20T04:00:00.000Z"),
        expirationDate: new Date("2026-11-23T04:00:00.000Z"),
        productName: "Cà chua bi hữu cơ",
        unit: "kg",
      };

      const originalEnv = env.NODE_ENV;
      const originalStorefrontUrl = env.STOREFRONT_URL;
      try {
        (env as { NODE_ENV: string }).NODE_ENV = "production";

        for (const unsafeUrl of [
          "http://localhost:3001",
          "http://greenroots.farm",
        ]) {
          (env as { STOREFRONT_URL: string }).STOREFRONT_URL = unsafeUrl;
          mockDb.setSelectResultsQueue([[row]]);

          try {
            await service.getBatchQrLabel(batchId);
            expect.unreachable("Expected Error");
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toMatch(/STOREFRONT_URL/);
          }
        }
      } finally {
        (env as { NODE_ENV: string }).NODE_ENV = originalEnv;
        (env as { STOREFRONT_URL: string }).STOREFRONT_URL =
          originalStorefrontUrl;
      }
    });
  });
});
