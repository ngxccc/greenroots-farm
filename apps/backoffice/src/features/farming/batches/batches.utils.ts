import {
  BUSINESS_RULES,
  BatchStatus,
  WasteLogStatus,
} from "@greenroots/shared";
import type { components } from "@/types/api-schema";

export type BatchDto = components["schemas"]["BatchDto"];
export type CreateBatchDto = components["schemas"]["CreateBatchDto"];
export type BatchQrLabelDto = components["schemas"]["BatchQrLabelDto"];
export type WasteLogDto = components["schemas"]["WasteLogDto"];
export type CreateWasteLogDto = components["schemas"]["CreateWasteLogDto"];
export type ProductDto = components["schemas"]["ProductDto"];
export type SeasonDto = components["schemas"]["SeasonDto"];

export const BATCH_MAX_SHELF_LIFE_DAYS = 3650;
export const WASTE_LOG_MIN_MEDIA_ITEMS = 1;
export const WASTE_LOG_MAX_MEDIA_ITEMS = 3;
export const WASTE_LOG_REASON_MAX_LENGTH = 255;

export interface BatchStatusMeta {
  readonly label: string;
  readonly badgeClassName: string;
}

export const BATCH_STATUS_META: Record<BatchStatus, BatchStatusMeta> = {
  [BatchStatus.IN_STOCK]: {
    label: "Đang bán",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-brand-dark",
  },
  [BatchStatus.NEAR_EXPIRY]: {
    label: "Sắp hết hạn",
    badgeClassName: "border-amber-200 bg-amber-50 text-amber-800",
  },
  [BatchStatus.SOLD_OUT]: {
    label: "Hết hàng",
    badgeClassName: "border-border-subtle bg-gray-100 text-gray-700",
  },
  [BatchStatus.EXPIRED]: {
    label: "Hết hạn",
    badgeClassName: "border-red-200 bg-red-50 text-status-spoiled",
  },
};

export interface WasteLogStatusMeta {
  readonly label: string;
  readonly badgeClassName: string;
}

export const WASTE_LOG_STATUS_META: Record<WasteLogStatus, WasteLogStatusMeta> =
  {
    [WasteLogStatus.PENDING_APPROVAL]: {
      label: "Chờ duyệt",
      badgeClassName: "border-amber-200 bg-amber-50 text-amber-800",
    },
    [WasteLogStatus.APPROVED]: {
      label: "Đã duyệt hủy",
      badgeClassName: "border-emerald-200 bg-emerald-50 text-brand-dark",
    },
    [WasteLogStatus.REJECTED]: {
      label: "Từ chối",
      badgeClassName: "border-red-200 bg-red-50 text-status-spoiled",
    },
  };

export type HsdAlertLevel = "fresh" | "near_expiry" | "expired" | "sold_out";

export interface HsdStatusResult {
  readonly level: HsdAlertLevel;
  readonly label: string;
  readonly countdownText: string;
  readonly hoursRemaining: number;
  readonly badgeClassName: string;
}

/**
 * Computes HSD alert level and human-readable countdown in Vietnamese.
 *
 * @param expirationDate ISO-8601 expiration timestamp of the batch.
 * @param status Current server-computed batch status.
 * @param now Reference timestamp for deterministic unit testing.
 * @returns HSD alert level, badge styling, and countdown copy.
 */
export function computeHsdStatus(
  expirationDate: string,
  status: BatchStatus,
  now: Date = new Date(),
): HsdStatusResult {
  if (status === BatchStatus.SOLD_OUT) {
    return {
      level: "sold_out",
      label: "Hết hàng",
      countdownText: "Đã bán hết tồn kho",
      hoursRemaining: 0,
      badgeClassName: "border-border-subtle bg-gray-100 text-gray-700",
    };
  }

  const expiryMs = new Date(expirationDate).getTime();
  const diffMs = expiryMs - now.getTime();
  const hoursRemaining = Math.floor(diffMs / (1000 * 60 * 60));

  if (status === BatchStatus.EXPIRED || diffMs <= 0) {
    return {
      level: "expired",
      label: "Đã hết hạn",
      countdownText: "Quá hạn sử dụng",
      hoursRemaining: Math.min(0, hoursRemaining),
      badgeClassName: "border-red-200 bg-red-50 text-status-spoiled",
    };
  }

  const daysRemaining = Math.floor(hoursRemaining / 24);
  const remainderHours = hoursRemaining % 24;
  const countdownText =
    daysRemaining >= 1
      ? `Còn ${daysRemaining} ngày ${remainderHours} giờ`
      : `Còn ${Math.max(1, hoursRemaining)} giờ`;

  if (
    status === BatchStatus.NEAR_EXPIRY ||
    hoursRemaining <= BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD
  ) {
    return {
      level: "near_expiry",
      label: "Sắp hết hạn",
      countdownText,
      hoursRemaining,
      badgeClassName: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }

  return {
    level: "fresh",
    label: "Tươi mới",
    countdownText,
    hoursRemaining,
    badgeClassName: "border-emerald-200 bg-emerald-50 text-brand-dark",
  };
}

/**
 * Formats an ISO-8601 timestamp in `Asia/Ho_Chi_Minh` (`dd/MM/yyyy HH:mm`).
 */
export function formatVietnamDateTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Formats an ISO-8601 timestamp as a Vietnamese date (`dd/MM/yyyy`) in `Asia/Ho_Chi_Minh`.
 */
export function formatVietnamDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/**
 * Builds an ISO-8601 timestamp with `+07:00` offset from date and optional `HH:mm` inputs.
 *
 * @param dateStr Date string in `YYYY-MM-DD` format.
 * @param timeStr Optional time string in `HH:mm` format (defaults to `04:00`).
 * @returns ISO-8601 string with `+07:00` offset, or `null` if invalid.
 */
export function toVietnamIsoDateTime(
  dateStr: string,
  timeStr = "04:00",
): string | null {
  const trimmedDate = dateStr.trim();
  const trimmedTime = timeStr.trim() || "04:00";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
    return null;
  }
  if (!/^\d{2}:\d{2}$/.test(trimmedTime)) {
    return null;
  }

  const isoCandidate = `${trimmedDate}T${trimmedTime}:00+07:00`;
  const parsed = new Date(isoCandidate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return isoCandidate;
}

export interface BatchIntakeDraft {
  readonly productId: string;
  readonly seasonId: string;
  readonly harvestDate: string;
  readonly harvestTime?: string;
  readonly shelfLifeDays: number;
  readonly initialQuantity: number;
}

export interface BatchIntakeValidationResult {
  readonly valid: boolean;
  readonly error: string | null;
  readonly payload?: CreateBatchDto;
}

/**
 * Validates batch intake form fields and builds a `CreateBatchDto` payload.
 */
export function validateBatchIntakeInput(
  draft: BatchIntakeDraft,
): BatchIntakeValidationResult {
  if (!draft.productId.trim()) {
    return { valid: false, error: "Vui lòng chọn sản phẩm thu hoạch." };
  }
  if (!draft.seasonId.trim()) {
    return { valid: false, error: "Vui lòng chọn mùa vụ canh tác." };
  }

  const harvestIso = toVietnamIsoDateTime(draft.harvestDate, draft.harvestTime);
  if (!harvestIso) {
    return {
      valid: false,
      error: "Ngày giờ thu hoạch không hợp lệ (định dạng YYYY-MM-DD).",
    };
  }

  if (
    !Number.isInteger(draft.shelfLifeDays) ||
    draft.shelfLifeDays < 1 ||
    draft.shelfLifeDays > BATCH_MAX_SHELF_LIFE_DAYS
  ) {
    return {
      valid: false,
      error: `Hạn sử dụng phải là số nguyên từ 1 đến ${BATCH_MAX_SHELF_LIFE_DAYS} ngày.`,
    };
  }

  if (!Number.isFinite(draft.initialQuantity) || draft.initialQuantity <= 0) {
    return {
      valid: false,
      error: "Sản lượng thu hoạch phải lớn hơn 0.",
    };
  }

  return {
    valid: true,
    error: null,
    payload: {
      productId: draft.productId.trim(),
      seasonId: draft.seasonId.trim(),
      harvestDate: harvestIso,
      shelfLifeDays: draft.shelfLifeDays,
      initialQuantity: draft.initialQuantity,
    },
  };
}

/**
 * Computes remaining quantity available for a new waste write-off proposal
 * by subtracting pending_approval waste quantities on the same batch.
 */
export function computeRemainingWasteAllowance(
  batch: Pick<BatchDto, "availableQuantity">,
  wasteLogs: readonly Pick<
    WasteLogDto,
    "batchId" | "discardedQuantity" | "status"
  >[],
  batchId: string,
): number {
  const pendingQty = wasteLogs
    .filter(
      (log) =>
        log.batchId === batchId &&
        log.status === WasteLogStatus.PENDING_APPROVAL,
    )
    .reduce((sum, log) => sum + log.discardedQuantity, 0);

  return Math.max(0, Number((batch.availableQuantity - pendingQty).toFixed(2)));
}

export interface WasteProposalDraft {
  readonly batchId: string;
  readonly discardedQuantity: number;
  readonly reason: string;
  readonly mediaCount: number;
  readonly maxAllowedQuantity: number;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly error: string | null;
}

/**
 * Validates a waste write-off proposal before uploading proof media and calling `POST /api/v1/waste-logs`.
 */
export function validateWasteProposalInput(
  draft: WasteProposalDraft,
): ValidationResult {
  if (!draft.batchId.trim()) {
    return { valid: false, error: "Vui lòng chọn lô hàng cần xuất hủy." };
  }

  if (
    !Number.isFinite(draft.discardedQuantity) ||
    draft.discardedQuantity <= 0
  ) {
    return {
      valid: false,
      error: "Số lượng đề xuất hủy phải lớn hơn 0.",
    };
  }

  if (draft.discardedQuantity > draft.maxAllowedQuantity) {
    return {
      valid: false,
      error: `Số lượng đề xuất vượt quá tồn kho khả dụng còn lại (${draft.maxAllowedQuantity}).`,
    };
  }

  const trimmedReason = draft.reason.trim();
  if (!trimmedReason) {
    return { valid: false, error: "Vui lòng nhập lý do xuất hủy." };
  }

  if (trimmedReason.length > WASTE_LOG_REASON_MAX_LENGTH) {
    return {
      valid: false,
      error: `Lý do xuất hủy tối đa ${WASTE_LOG_REASON_MAX_LENGTH} ký tự.`,
    };
  }

  if (
    draft.mediaCount < WASTE_LOG_MIN_MEDIA_ITEMS ||
    draft.mediaCount > WASTE_LOG_MAX_MEDIA_ITEMS
  ) {
    return {
      valid: false,
      error: `Vui lòng đính kèm từ ${WASTE_LOG_MIN_MEDIA_ITEMS} đến ${WASTE_LOG_MAX_MEDIA_ITEMS} ảnh bằng chứng.`,
    };
  }

  return { valid: true, error: null };
}

export interface QrPrintEligibility {
  readonly allowed: boolean;
  readonly warning: string | null;
}

/**
 * Checks whether routine thermal QR label printing is permitted for the batch status (ADR-0028).
 */
export function canPrintBatchQrLabel(status: BatchStatus): QrPrintEligibility {
  if (status === BatchStatus.EXPIRED) {
    return {
      allowed: false,
      warning:
        "Lô hàng đã hết hạn sử dụng. Không được in tem QR xuất bán; vui lòng chuyển sang đề xuất xuất hủy.",
    };
  }
  if (status === BatchStatus.SOLD_OUT) {
    return {
      allowed: false,
      warning:
        "Lô hàng đã hết tồn kho. Không thể in tem QR xuất bán cho lô đã bán hết.",
    };
  }
  return { allowed: true, warning: null };
}

export interface FormattedQrLabelMeta {
  readonly batchCode: string;
  readonly productName: string;
  readonly unit: string;
  readonly harvestDateFormatted: string;
  readonly expirationDateFormatted: string;
  readonly qrValue: string;
  readonly traceUrl: string;
}

/**
 * Formats `BatchQrLabelDto` timestamps in `Asia/Ho_Chi_Minh` for thermal label rendering.
 */
export function formatQrLabelMeta(dto: BatchQrLabelDto): FormattedQrLabelMeta {
  return {
    batchCode: dto.labelPayload.batchCode,
    productName: dto.labelPayload.productName,
    unit: dto.labelPayload.unit,
    harvestDateFormatted: formatVietnamDate(dto.labelPayload.harvestDate),
    expirationDateFormatted: formatVietnamDate(dto.labelPayload.expirationDate),
    qrValue: dto.labelPayload.qrValue,
    traceUrl: dto.traceUrl,
  };
}
