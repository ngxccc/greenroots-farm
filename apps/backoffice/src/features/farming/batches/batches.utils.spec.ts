import { describe, expect, it } from "bun:test";
import { BatchStatus, WasteLogStatus } from "@greenroots/shared";
import {
  canPrintBatchQrLabel,
  computeHsdStatus,
  computeRemainingWasteAllowance,
  formatQrLabelMeta,
  toVietnamIsoDateTime,
  validateBatchIntakeInput,
  validateWasteProposalInput,
  type BatchQrLabelDto,
} from "./batches.utils";

describe("batches.utils", () => {
  describe("computeHsdStatus", () => {
    it("returns fresh status when expiration exceeds 48 hours", () => {
      // Invariant: INV-BATCH-HSD-THRESHOLD
      const now = new Date("2026-11-20T04:00:00+07:00");
      const result = computeHsdStatus(
        "2026-11-25T04:00:00+07:00",
        BatchStatus.IN_STOCK,
        now,
      );

      expect(result.level).toBe("fresh");
      expect(result.hoursRemaining).toBe(120);
      expect(result.countdownText).toBe("Còn 5 ngày 0 giờ");
    });

    it("returns near_expiry status when remaining hours are within 48 hours", () => {
      // Invariant: INV-BATCH-HSD-THRESHOLD
      const now = new Date("2026-11-20T04:00:00+07:00");
      const result = computeHsdStatus(
        "2026-11-21T16:00:00+07:00",
        BatchStatus.IN_STOCK,
        now,
      );

      expect(result.level).toBe("near_expiry");
      expect(result.hoursRemaining).toBe(36);
      expect(result.countdownText).toBe("Còn 1 ngày 12 giờ");
    });

    it("returns expired status when expiration timestamp has passed", () => {
      // Invariant: INV-BATCH-HSD-THRESHOLD
      const now = new Date("2026-11-20T04:00:00+07:00");
      const result = computeHsdStatus(
        "2026-11-19T20:00:00+07:00",
        BatchStatus.EXPIRED,
        now,
      );

      expect(result.level).toBe("expired");
      expect(result.hoursRemaining).toBeLessThanOrEqual(0);
    });

    it("returns sold_out status regardless of expiration timestamp", () => {
      const now = new Date("2026-11-20T04:00:00+07:00");
      const result = computeHsdStatus(
        "2026-11-25T04:00:00+07:00",
        BatchStatus.SOLD_OUT,
        now,
      );

      expect(result.level).toBe("sold_out");
      expect(result.hoursRemaining).toBe(0);
    });
  });

  describe("toVietnamIsoDateTime", () => {
    it("formats valid date and time inputs with +07:00 offset", () => {
      expect(toVietnamIsoDateTime("2026-11-20", "04:30")).toBe(
        "2026-11-20T04:30:00+07:00",
      );
      expect(toVietnamIsoDateTime("2026-11-20")).toBe(
        "2026-11-20T04:00:00+07:00",
      );
    });

    it("rejects malformed date or time inputs", () => {
      expect(toVietnamIsoDateTime("20-11-2026", "04:00")).toBeNull();
      expect(toVietnamIsoDateTime("2026-11-20", "4:00")).toBeNull();
    });
  });

  describe("validateBatchIntakeInput", () => {
    it("builds CreateBatchDto payload when all intake fields are valid", () => {
      const result = validateBatchIntakeInput({
        productId: "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9f",
        seasonId: "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9a",
        harvestDate: "2026-11-20",
        harvestTime: "05:00",
        shelfLifeDays: 5,
        initialQuantity: 40,
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
      expect(result.payload).toEqual({
        productId: "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9f",
        seasonId: "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9a",
        harvestDate: "2026-11-20T05:00:00+07:00",
        shelfLifeDays: 5,
        initialQuantity: 40,
      });
    });

    it("rejects missing product or season selection", () => {
      const noProduct = validateBatchIntakeInput({
        productId: "",
        seasonId: "season-1",
        harvestDate: "2026-11-20",
        shelfLifeDays: 5,
        initialQuantity: 10,
      });
      expect(noProduct.valid).toBe(false);

      const noSeason = validateBatchIntakeInput({
        productId: "prod-1",
        seasonId: "",
        harvestDate: "2026-11-20",
        shelfLifeDays: 5,
        initialQuantity: 10,
      });
      expect(noSeason.valid).toBe(false);
    });

    it("rejects non-integer shelf life or non-positive quantity", () => {
      const badShelfLife = validateBatchIntakeInput({
        productId: "prod-1",
        seasonId: "season-1",
        harvestDate: "2026-11-20",
        shelfLifeDays: 2.5,
        initialQuantity: 10,
      });
      expect(badShelfLife.valid).toBe(false);

      const zeroQty = validateBatchIntakeInput({
        productId: "prod-1",
        seasonId: "season-1",
        harvestDate: "2026-11-20",
        shelfLifeDays: 5,
        initialQuantity: 0,
      });
      expect(zeroQty.valid).toBe(false);
    });
  });

  describe("computeRemainingWasteAllowance", () => {
    it("subtracts only pending_approval proposals for the target batch", () => {
      // Invariant: INV-WASTE-ALLOWANCE-NO-DOUBLE-COUNT
      const remaining = computeRemainingWasteAllowance(
        { availableQuantity: 25 },
        [
          {
            batchId: "batch-1",
            discardedQuantity: 6,
            status: WasteLogStatus.PENDING_APPROVAL,
          },
          {
            batchId: "batch-1",
            discardedQuantity: 4,
            status: WasteLogStatus.APPROVED,
          },
          {
            batchId: "batch-1",
            discardedQuantity: 3,
            status: WasteLogStatus.REJECTED,
          },
          {
            batchId: "batch-2",
            discardedQuantity: 10,
            status: WasteLogStatus.PENDING_APPROVAL,
          },
        ],
        "batch-1",
      );

      expect(remaining).toBe(19);
    });
  });

  describe("validateWasteProposalInput", () => {
    it("accepts valid waste proposal within remaining allowance and media bounds", () => {
      const result = validateWasteProposalInput({
        batchId: "batch-1",
        discardedQuantity: 5,
        reason: "Rau bị dập nát trong quá trình phân loại tại kho",
        mediaCount: 2,
        maxAllowedQuantity: 10,
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it("rejects proposals exceeding remaining allowance or missing proof images", () => {
      const exceeds = validateWasteProposalInput({
        batchId: "batch-1",
        discardedQuantity: 12,
        reason: "Hư hỏng",
        mediaCount: 1,
        maxAllowedQuantity: 10,
      });
      expect(exceeds.valid).toBe(false);

      const noMedia = validateWasteProposalInput({
        batchId: "batch-1",
        discardedQuantity: 3,
        reason: "Hư hỏng",
        mediaCount: 0,
        maxAllowedQuantity: 10,
      });
      expect(noMedia.valid).toBe(false);

      const tooManyMedia = validateWasteProposalInput({
        batchId: "batch-1",
        discardedQuantity: 3,
        reason: "Hư hỏng",
        mediaCount: 4,
        maxAllowedQuantity: 10,
      });
      expect(tooManyMedia.valid).toBe(false);
    });
  });

  describe("canPrintBatchQrLabel", () => {
    it("allows printing for in_stock and near_expiry batches", () => {
      // Invariant: INV-QR-PRINT-STATUS-GUARD
      expect(canPrintBatchQrLabel(BatchStatus.IN_STOCK).allowed).toBe(true);
      expect(canPrintBatchQrLabel(BatchStatus.NEAR_EXPIRY).allowed).toBe(true);
    });

    it("blocks routine printing for expired and sold_out batches", () => {
      // Invariant: INV-QR-PRINT-STATUS-GUARD
      const expired = canPrintBatchQrLabel(BatchStatus.EXPIRED);
      expect(expired.allowed).toBe(false);
      expect(expired.warning).toBeTruthy();

      const soldOut = canPrintBatchQrLabel(BatchStatus.SOLD_OUT);
      expect(soldOut.allowed).toBe(false);
      expect(soldOut.warning).toBeTruthy();
    });
  });

  describe("formatQrLabelMeta", () => {
    it("formats harvestDate and expirationDate in Asia/Ho_Chi_Minh timezone", () => {
      const dto: BatchQrLabelDto = {
        batchCode: "GR-261120-001",
        traceUrl: "https://greenroots.vn/trace/GR-261120-001",
        labelPayload: {
          batchCode: "GR-261120-001",
          productName: "Cải ngọt hữu cơ",
          unit: "kg",
          harvestDate: "2026-11-20T04:00:00+07:00",
          expirationDate: "2026-11-25T04:00:00+07:00",
          qrValue: "https://greenroots.vn/trace/GR-261120-001",
        },
      };

      const formatted = formatQrLabelMeta(dto);
      expect(formatted.batchCode).toBe("GR-261120-001");
      expect(formatted.productName).toBe("Cải ngọt hữu cơ");
      expect(formatted.unit).toBe("kg");
      expect(formatted.harvestDateFormatted).toBe("20/11/2026");
      expect(formatted.expirationDateFormatted).toBe("25/11/2026");
      expect(formatted.qrValue).toBe(
        "https://greenroots.vn/trace/GR-261120-001",
      );
    });
  });
});
