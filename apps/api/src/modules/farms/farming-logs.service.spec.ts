import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  type HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  API_ERROR_CODES,
  FarmingActionType,
  SeasonStatus,
} from "@greenroots/shared";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import { createMockDb } from "../../../test/mocks/mock-database";
import { FarmingLogsService } from "./farming-logs.service";
import type { TraceCacheService } from "./trace-cache.service";

type MockDb = ReturnType<typeof createMockDb> & {
  setSelectResultsQueue: (results: unknown[][]) => void;
  mockInsertValues: { mockImplementationOnce: (fn: () => unknown) => void };
};

async function expectThrowsHttpCode(
  operation: () => Promise<unknown>,
  ExceptionClass: new (...args: never[]) => HttpException,
  expectedCode: string,
  expectedDetail?: string,
): Promise<void> {
  try {
    await operation();
    expect.unreachable(`Expected ${ExceptionClass.name}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ExceptionClass);
    const response = (error as HttpException).getResponse();
    expect(response).toMatchObject({
      code: expectedCode,
      ...(expectedDetail !== undefined ? { detail: expectedDetail } : {}),
    });
  }
}

describe("FarmingLogsService", () => {
  const seasonId = "019fa8bc-8f4d-7000-b366-e691f45cfb91";
  const otherSeasonId = "019fa8bc-8f4d-7000-b366-e691f45cfb92";
  const staffId = "019fa8bc-8f4d-7000-b366-e691f45cfb93";
  const logId = "019fa8bc-8f4d-7000-b366-e691f45cfb94";
  const targetLogId = "019fa8bc-8f4d-7000-b366-e691f45cfb95";
  const loggedAt = new Date("2026-11-19T10:00:00.000Z");

  let service: FarmingLogsService;
  let mockDb: MockDb;
  let mockTraceCacheService: {
    invalidateBySeasonId: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    mockDb = createMockDb() as unknown as MockDb;
    mockTraceCacheService = {
      invalidateBySeasonId: mock(() => Promise.resolve()),
    };
    service = new FarmingLogsService(
      mockDb,
      mockTraceCacheService as unknown as TraceCacheService,
    );
  });

  describe("listLogs", () => {
    it("throws not found when season does not exist", async () => {
      mockDb.setSelectResultsQueue([[]]);

      await expectThrowsHttpCode(
        () =>
          service.listLogs(seasonId, {
            page: 1,
            limit: 20,
            sort: "loggedAt:desc",
          }),
        NotFoundException,
        API_ERROR_CODES.SEASON_NOT_FOUND,
      );
    });

    it("hydrates bidirectional correction linkage and normalizes null mediaUrls to empty arrays", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: seasonId }],
        [{ total: 1 }],
        [
          {
            log: {
              id: logId,
              seasonId,
              staffId,
              actionType: FarmingActionType.CORRECTION,
              description: "Điều chỉnh lượng phân bón",
              mediaUrls: null,
              correctsLogId: targetLogId,
              loggedAt,
            },
            staff: { id: staffId, fullName: "Nguyễn Văn An" },
            targetLog: {
              id: targetLogId,
              actionType: FarmingActionType.BIO_FERTILIZING,
              description: "Bón phân đợt 1",
              loggedAt,
            },
          },
        ],
        [
          {
            id: "019fa8bc-8f4d-7000-b366-e691f45cfb96",
            correctsLogId: logId,
            loggedAt,
            staff: { id: staffId, fullName: "Nguyễn Văn An" },
          },
        ],
      ]);

      const result = await service.listLogs(seasonId, {
        page: 1,
        limit: 20,
        sort: "loggedAt:desc",
      });

      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
      expect(result.items).toEqual([
        {
          id: logId,
          seasonId,
          staffId,
          staff: { id: staffId, fullName: "Nguyễn Văn An" },
          actionType: FarmingActionType.CORRECTION,
          description: "Điều chỉnh lượng phân bón",
          mediaUrls: [],
          correctsLogId: targetLogId,
          correctsLog: {
            id: targetLogId,
            actionType: FarmingActionType.BIO_FERTILIZING,
            description: "Bón phân đợt 1",
            loggedAt: loggedAt.toISOString(),
          },
          correctedBy: [
            {
              id: "019fa8bc-8f4d-7000-b366-e691f45cfb96",
              loggedAt: loggedAt.toISOString(),
              staff: { id: staffId, fullName: "Nguyễn Văn An" },
            },
          ],
          loggedAt: loggedAt.toISOString(),
        },
      ]);
    });
  });

  describe("createLog", () => {
    it("throws not found when season is missing", async () => {
      mockDb.setSelectResultsQueue([[]]);

      await expectThrowsHttpCode(
        () =>
          service.createLog(seasonId, staffId, {
            actionType: FarmingActionType.WATERING,
            description: "Tưới nhỏ giọt",
          }),
        NotFoundException,
        API_ERROR_CODES.SEASON_NOT_FOUND,
      );
    });

    it("permits soil testing and correction during planning while rejecting field cultivation", async () => {
      for (const allowedAction of [
        FarmingActionType.SOIL_TESTING,
        FarmingActionType.CORRECTION,
      ]) {
        mockDb.setSelectResultsQueue([
          [{ id: seasonId, status: SeasonStatus.PLANNING }],
          [
            {
              id: logId,
              seasonId,
              staffId,
              actionType: allowedAction,
              description: "Chuẩn bị đầu vụ",
              mediaUrls: null,
              correctsLogId: null,
              loggedAt,
            },
          ],
          [{ id: staffId, fullName: "Nguyễn Văn An" }],
        ]);

        const created = await service.createLog(seasonId, staffId, {
          actionType: allowedAction,
          description: "Chuẩn bị đầu vụ",
        });
        expect(created.actionType).toBe(allowedAction);
      }

      mockDb.setSelectResultsQueue([
        [{ id: seasonId, status: SeasonStatus.PLANNING }],
      ]);

      await expectThrowsHttpCode(
        () =>
          service.createLog(seasonId, staffId, {
            actionType: FarmingActionType.SEEDING,
            description: "Gieo hạt sớm",
          }),
        UnprocessableEntityException,
        API_ERROR_CODES.FARMING_LOG_SEASON_STATUS_INVALID,
      );
    });

    it("permits all farming actions during active and harvested seasons", async () => {
      for (const status of [SeasonStatus.ACTIVE, SeasonStatus.HARVESTED]) {
        mockDb.setSelectResultsQueue([
          [{ id: seasonId, status }],
          [
            {
              id: logId,
              seasonId,
              staffId,
              actionType: FarmingActionType.HARVESTING,
              description: "Thu hoạch theo lô",
              mediaUrls: null,
              correctsLogId: null,
              loggedAt,
            },
          ],
          [{ id: staffId, fullName: "Nguyễn Văn An" }],
        ]);

        const created = await service.createLog(seasonId, staffId, {
          actionType: FarmingActionType.HARVESTING,
          description: "Thu hoạch theo lô",
        });
        expect(created.actionType).toBe(FarmingActionType.HARVESTING);
      }
    });

    it("permits correction logs during completed status while rejecting cultivation actions", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: seasonId, status: SeasonStatus.COMPLETED }],
        [
          {
            id: logId,
            seasonId,
            staffId,
            actionType: FarmingActionType.CORRECTION,
            description: "Đính chính hậu kiểm",
            mediaUrls: null,
            correctsLogId: null,
            loggedAt,
          },
        ],
        [{ id: staffId, fullName: "Nguyễn Văn An" }],
      ]);

      const correction = await service.createLog(seasonId, staffId, {
        actionType: FarmingActionType.CORRECTION,
        description: "Đính chính hậu kiểm",
      });
      expect(correction.actionType).toBe(FarmingActionType.CORRECTION);

      mockDb.setSelectResultsQueue([
        [{ id: seasonId, status: SeasonStatus.COMPLETED }],
      ]);

      await expectThrowsHttpCode(
        () =>
          service.createLog(seasonId, staffId, {
            actionType: FarmingActionType.HARVESTING,
            description: "Thu hoạch muộn",
          }),
        UnprocessableEntityException,
        API_ERROR_CODES.FARMING_LOG_SEASON_STATUS_INVALID,
      );
    });

    it("rejects correctsLogId when actionType is not correction", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: seasonId, status: SeasonStatus.ACTIVE }],
      ]);

      await expectThrowsHttpCode(
        () =>
          service.createLog(seasonId, staffId, {
            actionType: FarmingActionType.WATERING,
            description: "Tưới nước",
            correctsLogId: targetLogId,
          }),
        UnprocessableEntityException,
        API_ERROR_CODES.FARMING_LOG_CORRECTION_TARGET_INVALID,
      );
    });

    it("rejects correctsLogId referencing another season", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: seasonId, status: SeasonStatus.ACTIVE }],
        [
          {
            id: targetLogId,
            seasonId: otherSeasonId,
            actionType: FarmingActionType.WATERING,
            description: "Log mùa khác",
            loggedAt,
          },
        ],
      ]);

      await expectThrowsHttpCode(
        () =>
          service.createLog(seasonId, staffId, {
            actionType: FarmingActionType.CORRECTION,
            description: "Đính chính sai mùa",
            correctsLogId: targetLogId,
          }),
        UnprocessableEntityException,
        API_ERROR_CODES.FARMING_LOG_CORRECTION_TARGET_INVALID,
      );
    });

    it("maps database composite FK violation to semantic correction-target error", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: seasonId, status: SeasonStatus.ACTIVE }],
        [
          {
            id: targetLogId,
            seasonId,
            actionType: FarmingActionType.WATERING,
            description: "Tưới nước",
            loggedAt,
          },
        ],
      ]);
      mockDb.mockInsertValues.mockImplementationOnce(() => ({
        returning: () =>
          Promise.reject(
            Object.assign(new Error("fk violation"), {
              code: PG_ERROR_CODE.FOREIGN_KEY_VIOLATION,
              constraint: "farming_logs_corrects_log_same_season_fkey",
            }),
          ),
      }));

      await expectThrowsHttpCode(
        () =>
          service.createLog(seasonId, staffId, {
            actionType: FarmingActionType.CORRECTION,
            description: "Đính chính",
            correctsLogId: targetLogId,
          }),
        UnprocessableEntityException,
        API_ERROR_CODES.FARMING_LOG_CORRECTION_TARGET_INVALID,
        MESSAGES.FARMING_LOGS.CORRECTION_TARGET_MISSING_OR_CROSS_SEASON,
      );
    });

    it("maps database check constraint violations to distinct semantic error details", async () => {
      mockDb.setSelectResultsQueue([
        [{ id: seasonId, status: SeasonStatus.ACTIVE }],
        [
          {
            id: targetLogId,
            seasonId,
            actionType: FarmingActionType.WATERING,
            description: "Tưới nước",
            loggedAt,
          },
        ],
      ]);
      mockDb.mockInsertValues.mockImplementationOnce(() => ({
        returning: () =>
          Promise.reject(
            Object.assign(new Error("check action violation"), {
              code: PG_ERROR_CODE.CHECK_VIOLATION,
              constraint: "farming_logs_correction_action_chk",
            }),
          ),
      }));

      await expectThrowsHttpCode(
        () =>
          service.createLog(seasonId, staffId, {
            actionType: FarmingActionType.CORRECTION,
            description: "Đính chính",
            correctsLogId: targetLogId,
          }),
        UnprocessableEntityException,
        API_ERROR_CODES.FARMING_LOG_CORRECTION_TARGET_INVALID,
        MESSAGES.FARMING_LOGS.CORRECTION_ID_NOT_ALLOWED_FOR_ACTION,
      );

      mockDb.setSelectResultsQueue([
        [{ id: seasonId, status: SeasonStatus.ACTIVE }],
        [
          {
            id: targetLogId,
            seasonId,
            actionType: FarmingActionType.WATERING,
            description: "Tưới nước",
            loggedAt,
          },
        ],
      ]);
      mockDb.mockInsertValues.mockImplementationOnce(() => ({
        returning: () =>
          Promise.reject(
            Object.assign(new Error("check self-correction violation"), {
              code: PG_ERROR_CODE.CHECK_VIOLATION,
              constraint: "farming_logs_no_self_correction_chk",
            }),
          ),
      }));

      await expectThrowsHttpCode(
        () =>
          service.createLog(seasonId, staffId, {
            actionType: FarmingActionType.CORRECTION,
            description: "Đính chính",
            correctsLogId: targetLogId,
          }),
        UnprocessableEntityException,
        API_ERROR_CODES.FARMING_LOG_CORRECTION_TARGET_INVALID,
        MESSAGES.FARMING_LOGS.SELF_CORRECTION_FORBIDDEN,
      );
    });
  });
});
