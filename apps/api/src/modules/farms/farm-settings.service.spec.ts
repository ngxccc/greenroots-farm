import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import {
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { API_ERROR_CODES, BUSINESS_RULES } from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import type { RedisService } from "@/common/services/redis.service";
import { createMockDb } from "../../../test/mocks/mock-database";
import {
  FARM_SETTINGS_CACHE_KEY,
  FARM_SETTINGS_CACHE_TTL_SECONDS,
  FARM_SETTINGS_INVALIDATED_AT_KEY,
} from "./farms.interface";
import { FarmSettingsService } from "./farm-settings.service";

type MockDb = ReturnType<typeof createMockDb> & {
  setSelectResult: (result: unknown[]) => void;
  setSelectResultsQueue: (results: unknown[][]) => void;
};

describe("FarmSettingsService", () => {
  const timestamp = new Date("2026-11-19T00:00:00.000Z");

  const sampleFarmRow = {
    id: "019fa8bc-8f4d-7000-b366-e691f45cfb90",
    name: BUSINESS_RULES.FARM_COORDINATES.NAME,
    legalName: "Công ty TNHH Nông nghiệp Hữu cơ GreenRoots",
    tagline: "Rau hữu cơ tươi mỗi ngày",
    taxId: "0316987654",
    address: BUSINESS_RULES.FARM_COORDINATES.ADDRESS,
    latitude: "11.00670000",
    longitude: "106.51320000",
    certificationUrl:
      "https://res.cloudinary.com/test-cloud/image/upload/v1/farms/vietgap.png",
    hotlines: { primary: "0909123456", support: "02838991234" },
    emails: {
      primary: "hello@greenroots.farm",
      support: "hotro@greenroots.farm",
    },
    workingHours: { weekdays: "07:00 - 18:00", weekend: "07:00 - 12:00" },
    bankInfo: {
      bankName: "Vietcombank",
      accountNumber: "0071001234567",
      accountHolder: "CONG TY TNHH NONG NGHIEP HUU CO GREENROOTS",
    },
    shippingConfig: {
      baseFeeVnd: 15000,
      freeKmThreshold: 3,
      perKmRateVnd: 5000,
      detourFactor: 1.3,
    },
    flashSaleConfig: {
      hoursThreshold: 48,
      discountPercent: 50,
    },
    isPayosEnabled: true,
    isCodEnabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  let service: FarmSettingsService;
  let mockDb: MockDb;
  let mockPipeline: {
    unlink: ReturnType<typeof mock>;
    set: ReturnType<typeof mock>;
    exec: ReturnType<typeof mock>;
  };
  let mockRedisClient: {
    get: ReturnType<typeof mock>;
    eval: ReturnType<typeof mock>;
    pipeline: ReturnType<typeof mock>;
  };
  let mockRedisService: RedisService;

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
      get: mock(() => Promise.resolve(null)),
      eval: mock(() => Promise.resolve(1)),
      pipeline: mock(() => mockPipeline),
    };
    mockRedisService = {
      getClient: () => mockRedisClient,
    } as unknown as RedisService;

    service = new FarmSettingsService(mockDb, mockRedisService);
  });

  describe("getSettings", () => {
    it("returns cached farm settings without querying PostgreSQL on cache hit", async () => {
      const cachedPayload = {
        ...sampleFarmRow,
        latitude: 11.0067,
        longitude: 106.5132,
        createdAt: timestamp.toISOString(),
        updatedAt: timestamp.toISOString(),
      };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(cachedPayload));

      const result = await service.getSettings();

      expect(result).toEqual(cachedPayload);
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it("falls back to PostgreSQL and backfills Redis with 24h TTL on cache miss", async () => {
      mockDb.setSelectResultsQueue([[sampleFarmRow]]);
      const beforeMs = Date.now();

      const result = await service.getSettings();
      const afterMs = Date.now();

      expect(result.id).toBe(sampleFarmRow.id);
      expect(result.latitude).toBe(11.0067);
      expect(result.longitude).toBe(106.5132);
      expect(mockRedisClient.eval).toHaveBeenCalledTimes(1);
      const evalArgs = mockRedisClient.eval.mock.calls[0] as unknown[];
      expect(evalArgs[1]).toBe(2);
      expect(evalArgs[2]).toBe(FARM_SETTINGS_CACHE_KEY);
      expect(evalArgs[3]).toBe(FARM_SETTINGS_INVALIDATED_AT_KEY);
      const readStartedAtArg = Number(evalArgs[5]);
      expect(readStartedAtArg).toBeGreaterThanOrEqual(beforeMs);
      expect(readStartedAtArg).toBeLessThanOrEqual(afterMs);
      expect(evalArgs[6]).toBe(String(FARM_SETTINGS_CACHE_TTL_SECONDS));
    });

    it("falls back to PostgreSQL without throwing when Redis read fails or holds corrupt JSON", async () => {
      mockRedisClient.get.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      mockDb.setSelectResultsQueue([[sampleFarmRow]]);

      const firstResult = await service.getSettings();
      expect(firstResult.id).toBe(sampleFarmRow.id);

      mockRedisClient.get.mockResolvedValueOnce("{corrupt-json");
      mockDb.setSelectResultsQueue([[sampleFarmRow]]);

      const secondResult = await service.getSettings();
      expect(secondResult.id).toBe(sampleFarmRow.id);
    });

    it("throws NotFoundException when the farms table has no singleton row", async () => {
      mockDb.setSelectResultsQueue([[]]);

      try {
        await service.getSettings();
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

  describe("updateSettings", () => {
    it("rejects disabling both PayOS and COD simultaneously", async () => {
      mockDb.setSelectResultsQueue([
        [{ ...sampleFarmRow, isPayosEnabled: true, isCodEnabled: false }],
      ]);

      try {
        await service.updateSettings({ isPayosEnabled: false });
        expect.unreachable("Expected UnprocessableEntityException");
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        expect((error as UnprocessableEntityException).getResponse()).toEqual({
          code: API_ERROR_CODES.FARM_PAYMENT_METHOD_REQUIRED,
          detail: MESSAGES.FARMS.PAYMENT_METHOD_REQUIRED,
        });
      }
      expect(mockPipeline.unlink).not.toHaveBeenCalled();
    });

    it("persists changes, unlinks the cache key, and tolerates post-commit Redis outage", async () => {
      const updatedRow = {
        ...sampleFarmRow,
        name: "GreenRoots Củ Chi",
        updatedAt: new Date("2026-11-19T01:00:00.000Z"),
      };
      mockDb.setSelectResultsQueue([[sampleFarmRow], [updatedRow]]);
      mockPipeline.exec.mockRejectedValueOnce(new Error("Redis unavailable"));

      const result = await service.updateSettings({
        name: "GreenRoots Củ Chi",
      });

      expect(result.name).toBe("GreenRoots Củ Chi");
      expect(mockPipeline.unlink).toHaveBeenCalledWith(FARM_SETTINGS_CACHE_KEY);
      expect(mockPipeline.set).toHaveBeenCalledTimes(1);
    });
  });
});
