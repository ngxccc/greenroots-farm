import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  ConflictException,
  ForbiddenException,
  type HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  API_ERROR_CODES,
  BatchStatus,
  UserRole,
  WasteLogStatus,
} from "@greenroots/shared";
import { createMockDb } from "../../../test/mocks/mock-database";
import { WasteLogsService } from "./waste-logs.service";

type MockDb = ReturnType<typeof createMockDb> & {
  setSelectResultsQueue: (results: unknown[][]) => void;
  mockInsertValues: ReturnType<typeof mock>;
  mockUpdateSet: ReturnType<typeof mock>;
};

async function expectHttpError(
  promise: Promise<unknown>,
  ExceptionClass: new (...args: never[]) => HttpException,
  expectedCode: string,
): Promise<void> {
  try {
    await promise;
    expect.unreachable(`Expected ${ExceptionClass.name}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ExceptionClass);
    const response = (error as HttpException).getResponse() as {
      code?: string;
    };
    expect(response.code).toBe(expectedCode);
  }
}

describe("WasteLogsService", () => {
  const batchId = "019fa8bc-8f4d-7000-b366-e691f45cfb10";
  const productId = "019fa8bc-8f4d-7000-b366-e691f45cfb20";
  const wasteLogId = "019fa8bc-8f4d-7000-b366-e691f45cfb30";
  const reporterId = "019fa8bc-8f4d-7000-b366-e691f45cfb40";
  const reviewerId = "019fa8bc-8f4d-7000-b366-e691f45cfb50";
  const createdAt = new Date("2026-11-20T06:00:00.000Z");
  const updatedAt = new Date("2026-11-20T06:00:00.000Z");

  const reporterActor = { sub: reporterId, role: UserRole.FARM_STAFF };
  const adminActor = { sub: reviewerId, role: UserRole.ADMIN };
  const salesActor = { sub: reviewerId, role: UserRole.SALES };

  const validMediaUrls = [
    "https://res.cloudinary.com/greenroots-dev/image/upload/v1/waste_logs/proof-01.webp",
  ];

  function buildJoinedRow(overrides?: {
    status?: WasteLogStatus;
    batchStatus?: BatchStatus;
    availableQuantity?: string;
    discardedQuantity?: string;
    reportedBy?: string;
    reviewedBy?: string | null;
    rejectionReason?: string | null;
    reviewedAt?: Date | null;
    reviewerName?: string | null;
  }) {
    const status = overrides?.status ?? WasteLogStatus.PENDING_APPROVAL;
    const reviewedBy =
      overrides?.reviewedBy !== undefined ? overrides.reviewedBy : null;
    const reviewerName =
      overrides?.reviewerName !== undefined ? overrides.reviewerName : null;

    return {
      wasteLog: {
        id: wasteLogId,
        batchId,
        reportedBy: overrides?.reportedBy ?? reporterId,
        reviewedBy,
        discardedQuantity: overrides?.discardedQuantity ?? "2.50",
        reason: "Dập nát khi vận chuyển lạnh",
        rejectionReason: overrides?.rejectionReason ?? null,
        mediaUrls: validMediaUrls,
        status,
        reviewedAt: overrides?.reviewedAt ?? null,
        createdAt,
        updatedAt,
      },
      batch: {
        id: batchId,
        batchCode: "BATCH-20261120-CACHUA-ABC123",
        productId,
        productName: "Cà chua bi hữu cơ",
        unit: "kg",
        status: overrides?.batchStatus ?? BatchStatus.IN_STOCK,
        availableQuantity: overrides?.availableQuantity ?? "10.00",
      },
      reporter: {
        id: overrides?.reportedBy ?? reporterId,
        fullName: "Nhân viên Kho",
      },
      reviewer:
        reviewedBy !== null && reviewerName !== null
          ? { id: reviewedBy, fullName: reviewerName }
          : null,
    };
  }

  let service: WasteLogsService;
  let mockDb: MockDb;

  beforeEach(() => {
    mockDb = createMockDb() as unknown as MockDb;
    service = new WasteLogsService(mockDb);
  });

  describe("createWasteLog", () => {
    // Invariant: INV-WASTE-1, INV-WASTE-2
    it("creates a pending waste proposal when unallocated batch stock covers the request", async () => {
      const joined = buildJoinedRow({ availableQuantity: "10.00" });
      mockDb.setSelectResultsQueue([
        [
          {
            id: batchId,
            status: BatchStatus.IN_STOCK,
            availableQuantity: "10.00",
          },
        ],
        [{ pendingSum: "3.00" }],
        [{ id: wasteLogId }],
        [joined],
      ]);

      const result = await service.createWasteLog(
        {
          batchId,
          discardedQuantity: 2.5,
          reason: "Dập nát khi vận chuyển lạnh",
          mediaUrls: validMediaUrls,
        },
        reporterActor,
      );

      expect(result.status).toBe(WasteLogStatus.PENDING_APPROVAL);
      expect(result.discardedQuantity).toBe(2.5);
      expect(result.reviewer).toBeNull();
      expect(result.batch.availableQuantity).toBe(10);
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it("throws forbidden when caller role is outside proposal allowlist", async () => {
      await expectHttpError(
        service.createWasteLog(
          {
            batchId,
            discardedQuantity: 1,
            reason: "Không đủ quyền",
            mediaUrls: validMediaUrls,
          },
          salesActor,
        ),
        ForbiddenException,
        API_ERROR_CODES.FORBIDDEN,
      );
    });

    it("throws not found when target batch does not exist", async () => {
      mockDb.setSelectResultsQueue([[]]);

      await expectHttpError(
        service.createWasteLog(
          {
            batchId,
            discardedQuantity: 1,
            reason: "Hư hỏng",
            mediaUrls: validMediaUrls,
          },
          reporterActor,
        ),
        NotFoundException,
        API_ERROR_CODES.BATCH_NOT_FOUND,
      );
    });

    it("rejects proposal when target batch is already sold out", async () => {
      mockDb.setSelectResultsQueue([
        [
          {
            id: batchId,
            status: BatchStatus.SOLD_OUT,
            availableQuantity: "0.00",
          },
        ],
      ]);

      await expectHttpError(
        service.createWasteLog(
          {
            batchId,
            discardedQuantity: 1,
            reason: "Hư hỏng",
            mediaUrls: validMediaUrls,
          },
          reporterActor,
        ),
        UnprocessableEntityException,
        API_ERROR_CODES.WASTE_LOG_BATCH_NOT_ELIGIBLE,
      );
    });

    // Invariant: INV-WASTE-2
    it("rejects proposal when discarded quantity exceeds available stock minus pending logs", async () => {
      mockDb.setSelectResultsQueue([
        [
          {
            id: batchId,
            status: BatchStatus.NEAR_EXPIRY,
            availableQuantity: "10.00",
          },
        ],
        [{ pendingSum: "8.00" }],
      ]);

      await expectHttpError(
        service.createWasteLog(
          {
            batchId,
            discardedQuantity: 2.01,
            reason: "Quá hạn",
            mediaUrls: validMediaUrls,
          },
          reporterActor,
        ),
        UnprocessableEntityException,
        API_ERROR_CODES.WASTE_LOG_QUANTITY_EXCEEDS_AVAILABLE,
      );
    });
  });

  describe("listWasteLogs", () => {
    it("maps paginated projections including nullable reviewer when reviewer was deleted", async () => {
      const approvedWithoutReviewer = buildJoinedRow({
        status: WasteLogStatus.APPROVED,
        reviewedBy: null,
        reviewerName: null,
        reviewedAt: createdAt,
      });

      mockDb.setSelectResultsQueue([[{ total: 1 }], [approvedWithoutReviewer]]);

      const result = await service.listWasteLogs(
        {
          page: 1,
          limit: 20,
          sort: "createdAt:desc",
          status: WasteLogStatus.APPROVED,
          search: "CACHUA",
        },
        adminActor,
      );

      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.reviewer).toBeNull();
      expect(result.items[0]?.reviewedAt).toBe(createdAt.toISOString());
    });

    it("forbids non-inventory roles from listing waste logs", async () => {
      await expectHttpError(
        service.listWasteLogs(
          { page: 1, limit: 20, sort: "createdAt:desc" },
          salesActor,
        ),
        ForbiddenException,
        API_ERROR_CODES.FORBIDDEN,
      );
    });
  });

  describe("getWasteLogById", () => {
    it("forbids farm staff from viewing another reporter waste log", async () => {
      mockDb.setSelectResultsQueue([
        [buildJoinedRow({ reportedBy: reporterId })],
      ]);

      await expectHttpError(
        service.getWasteLogById(wasteLogId, {
          sub: reviewerId,
          role: UserRole.FARM_STAFF,
        }),
        ForbiddenException,
        API_ERROR_CODES.FORBIDDEN,
      );
    });

    it("throws not found when waste log does not exist", async () => {
      mockDb.setSelectResultsQueue([[]]);

      await expectHttpError(
        service.getWasteLogById(wasteLogId, adminActor),
        NotFoundException,
        API_ERROR_CODES.WASTE_LOG_NOT_FOUND,
      );
    });
  });

  describe("approveWasteLog", () => {
    // Invariant: INV-WASTE-2
    it("deducts available quantity and transitions depleted in_stock and near_expiry batches to sold_out", async () => {
      for (const initialBatchStatus of [
        BatchStatus.IN_STOCK,
        BatchStatus.NEAR_EXPIRY,
      ]) {
        const approvedRow = buildJoinedRow({
          status: WasteLogStatus.APPROVED,
          batchStatus: BatchStatus.SOLD_OUT,
          availableQuantity: "0.00",
          discardedQuantity: "5.00",
          reviewedBy: reviewerId,
          reviewerName: "Quản trị viên",
          reviewedAt: createdAt,
        });

        mockDb.setSelectResultsQueue([
          [
            {
              id: wasteLogId,
              batchId,
              reportedBy: reporterId,
              discardedQuantity: "5.00",
              status: WasteLogStatus.PENDING_APPROVAL,
            },
          ],
          [
            {
              id: batchId,
              status: initialBatchStatus,
              availableQuantity: "5.00",
            },
          ],
          [approvedRow],
        ]);

        const result = await service.approveWasteLog(wasteLogId, adminActor);

        expect(result.status).toBe(WasteLogStatus.APPROVED);
        expect(result.batch.status).toBe(BatchStatus.SOLD_OUT);
        expect(result.batch.availableQuantity).toBe(0);
        expect(mockDb.mockUpdateSet).toHaveBeenCalledWith(
          expect.objectContaining({
            availableQuantity: "0.00",
            status: BatchStatus.SOLD_OUT,
          }),
        );
      }
    });

    it("preserves expired batch status when waste write-off depletes stock to zero", async () => {
      const approvedRow = buildJoinedRow({
        status: WasteLogStatus.APPROVED,
        batchStatus: BatchStatus.EXPIRED,
        availableQuantity: "0.00",
        discardedQuantity: "4.00",
        reviewedBy: reviewerId,
        reviewerName: "Quản trị viên",
        reviewedAt: createdAt,
      });

      mockDb.setSelectResultsQueue([
        [
          {
            id: wasteLogId,
            batchId,
            reportedBy: reporterId,
            discardedQuantity: "4.00",
            status: WasteLogStatus.PENDING_APPROVAL,
          },
        ],
        [
          {
            id: batchId,
            status: BatchStatus.EXPIRED,
            availableQuantity: "4.00",
          },
        ],
        [approvedRow],
      ]);

      const result = await service.approveWasteLog(wasteLogId, adminActor);

      expect(result.batch.status).toBe(BatchStatus.EXPIRED);
      expect(mockDb.mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          availableQuantity: "0.00",
          status: BatchStatus.EXPIRED,
        }),
      );
    });

    it("forbids non-reviewer roles from approving at service boundary", async () => {
      await expectHttpError(
        service.approveWasteLog(wasteLogId, reporterActor),
        ForbiddenException,
        API_ERROR_CODES.FORBIDDEN,
      );
    });

    // Invariant: INV-WASTE-3
    it("forbids reporter from approving their own waste log proposal", async () => {
      mockDb.setSelectResultsQueue([
        [
          {
            id: wasteLogId,
            batchId,
            reportedBy: reviewerId,
            discardedQuantity: "2.00",
            status: WasteLogStatus.PENDING_APPROVAL,
          },
        ],
      ]);

      await expectHttpError(
        service.approveWasteLog(wasteLogId, adminActor),
        ForbiddenException,
        API_ERROR_CODES.WASTE_LOG_SELF_REVIEW_FORBIDDEN,
      );
    });

    // Invariant: INV-WASTE-4
    it("throws conflict when waste log has already been reviewed", async () => {
      mockDb.setSelectResultsQueue([
        [
          {
            id: wasteLogId,
            batchId,
            reportedBy: reporterId,
            discardedQuantity: "2.00",
            status: WasteLogStatus.REJECTED,
          },
        ],
      ]);

      await expectHttpError(
        service.approveWasteLog(wasteLogId, adminActor),
        ConflictException,
        API_ERROR_CODES.WASTE_LOG_ALREADY_REVIEWED,
      );
    });

    // Invariant: INV-WASTE-2
    it("throws conflict without mutating state when batch available quantity dropped below proposal", async () => {
      mockDb.setSelectResultsQueue([
        [
          {
            id: wasteLogId,
            batchId,
            reportedBy: reporterId,
            discardedQuantity: "6.00",
            status: WasteLogStatus.PENDING_APPROVAL,
          },
        ],
        [
          {
            id: batchId,
            status: BatchStatus.IN_STOCK,
            availableQuantity: "4.00",
          },
        ],
      ]);

      await expectHttpError(
        service.approveWasteLog(wasteLogId, adminActor),
        ConflictException,
        API_ERROR_CODES.INSUFFICIENT_STOCK,
      );
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe("rejectWasteLog", () => {
    // Invariant: INV-WASTE-4
    it("marks pending waste log as rejected with reason and leaves batch stock untouched", async () => {
      const rejectedRow = buildJoinedRow({
        status: WasteLogStatus.REJECTED,
        reviewedBy: reviewerId,
        reviewerName: "Quản trị viên",
        rejectionReason: "Cần chụp rõ tem lô trên thùng.",
        reviewedAt: createdAt,
      });

      mockDb.setSelectResultsQueue([
        [
          {
            id: wasteLogId,
            batchId,
            reportedBy: reporterId,
            discardedQuantity: "2.50",
            status: WasteLogStatus.PENDING_APPROVAL,
          },
        ],
        [rejectedRow],
      ]);

      const result = await service.rejectWasteLog(
        wasteLogId,
        { rejectionReason: "Cần chụp rõ tem lô trên thùng." },
        adminActor,
      );

      expect(result.status).toBe(WasteLogStatus.REJECTED);
      expect(result.rejectionReason).toBe("Cần chụp rõ tem lô trên thùng.");
      expect(result.reviewer).toEqual({
        id: reviewerId,
        fullName: "Quản trị viên",
      });
    });

    // Invariant: INV-WASTE-3
    it("forbids reporter from rejecting their own waste log proposal", async () => {
      mockDb.setSelectResultsQueue([
        [
          {
            id: wasteLogId,
            batchId,
            reportedBy: reviewerId,
            discardedQuantity: "2.50",
            status: WasteLogStatus.PENDING_APPROVAL,
          },
        ],
      ]);

      await expectHttpError(
        service.rejectWasteLog(
          wasteLogId,
          { rejectionReason: "Tự hủy" },
          adminActor,
        ),
        ForbiddenException,
        API_ERROR_CODES.WASTE_LOG_SELF_REVIEW_FORBIDDEN,
      );
    });

    it("throws not found when rejecting a missing waste log", async () => {
      mockDb.setSelectResultsQueue([[]]);

      await expectHttpError(
        service.rejectWasteLog(
          wasteLogId,
          { rejectionReason: "Không tồn tại" },
          adminActor,
        ),
        NotFoundException,
        API_ERROR_CODES.WASTE_LOG_NOT_FOUND,
      );
    });
  });
});
