import { BatchStatus } from "@greenroots/shared";
import type { components } from "@/types/api-schema";

export type NearExpiryBatchDto = components["schemas"]["NearExpiryBatchDto"];
export type ToggleBatchFlashSaleDto =
  components["schemas"]["ToggleBatchFlashSaleDto"];
export type BatchDto = components["schemas"]["BatchDto"];

/** Minimum allowed Flash Sale discount percentage (inclusive). */
export const FLASH_SALE_DISCOUNT_MIN = 1;

/** Maximum allowed Flash Sale discount percentage (inclusive). */
export const FLASH_SALE_DISCOUNT_MAX = 90;

/** Filter options for Flash Sale state in the near-expiry table. */
export type FlashSaleFilter = "all" | "active" | "inactive";

/** Labels for the Flash Sale state filter select control. */
export const FLASH_SALE_FILTER_LABELS: Record<FlashSaleFilter, string> = {
  all: "Tất cả trạng thái",
  active: "Đang bật Flash Sale",
  inactive: "Chưa bật Flash Sale",
};

export type CountdownUrgency = "expired" | "critical" | "warning" | "normal";

export interface ShelfLifeCountdown {
  readonly label: string;
  readonly urgency: CountdownUrgency;
  readonly badgeClassName: string;
}

/**
 * Formats remaining shelf life hours into a Vietnamese countdown badge descriptor.
 *
 * @param hoursRemaining Remaining hours until batch expiration.
 * @returns Localized label, urgency tier, and semantic badge classes.
 */
export function formatShelfLifeCountdown(
  hoursRemaining: number,
): ShelfLifeCountdown {
  if (!Number.isFinite(hoursRemaining) || hoursRemaining <= 0) {
    return {
      label: "Đã hết hạn",
      urgency: "expired",
      badgeClassName: "border-red-200 bg-red-50 text-red-700",
    };
  }

  if (hoursRemaining < 1) {
    const minutes = Math.max(1, Math.round(hoursRemaining * 60));
    return {
      label: `Còn ${minutes} phút`,
      urgency: "critical",
      badgeClassName: "border-red-200 bg-red-50 text-red-700",
    };
  }

  if (hoursRemaining < 24) {
    let wholeHours = Math.floor(hoursRemaining);
    let minutes = Math.round((hoursRemaining - wholeHours) * 60);
    if (minutes === 60) {
      wholeHours += 1;
      minutes = 0;
    }

    const label =
      minutes > 0 ? `Còn ${wholeHours}g ${minutes}p` : `Còn ${wholeHours} giờ`;

    if (hoursRemaining <= 12) {
      return {
        label,
        urgency: "critical",
        badgeClassName: "border-red-200 bg-red-50 text-red-700",
      };
    }

    return {
      label,
      urgency: "warning",
      badgeClassName: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }

  const roundedHours = Math.round(hoursRemaining);
  return {
    label: `Còn ${roundedHours} giờ`,
    urgency: "normal",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-brand-dark",
  };
}

export interface FlashSaleEligibilityResult {
  readonly eligible: boolean;
  readonly reason: string | null;
}

/**
 * Evaluates whether a batch is eligible to enable Rescue Flash Sale.
 * Blocks expired batches (`<= 0h` or `expired` status) and zero-stock batches (`<= 0`).
 *
 * @param batch Batch fields relevant to Flash Sale eligibility.
 * @returns Eligibility boolean and localized Vietnamese explanation when blocked.
 */
export function evaluateFlashSaleEligibility(
  batch: Pick<
    NearExpiryBatchDto,
    "availableQuantity" | "hoursRemaining" | "status"
  >,
): FlashSaleEligibilityResult {
  if (batch.status === BatchStatus.EXPIRED || batch.hoursRemaining <= 0) {
    return {
      eligible: false,
      reason: "Lô hàng đã hết hạn sử dụng, không thể bật Flash Sale.",
    };
  }

  if (batch.status === BatchStatus.SOLD_OUT || batch.availableQuantity <= 0) {
    return {
      eligible: false,
      reason: "Lô hàng đã hết tồn kho khả dụng, không thể bật Flash Sale.",
    };
  }

  return {
    eligible: true,
    reason: null,
  };
}

export type DiscountValidationResult =
  | { readonly valid: true; readonly value: number }
  | { readonly valid: false; readonly error: string };

/**
 * Validates a Flash Sale discount percentage input as an integer between 1 and 90.
 *
 * @param rawInput Raw string or numeric discount input.
 * @returns Normalized integer discount when valid, or localized Vietnamese error.
 */
export function validateFlashSaleDiscount(
  rawInput: string | number,
): DiscountValidationResult {
  const normalized =
    typeof rawInput === "number" ? String(rawInput) : rawInput.trim();

  if (normalized.length === 0) {
    return {
      valid: false,
      error: "Vui lòng nhập phần trăm giảm giá Flash Sale.",
    };
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return {
      valid: false,
      error: "Phần trăm giảm giá phải là số nguyên.",
    };
  }

  if (parsed < FLASH_SALE_DISCOUNT_MIN || parsed > FLASH_SALE_DISCOUNT_MAX) {
    return {
      valid: false,
      error: `Phần trăm giảm giá phải từ ${FLASH_SALE_DISCOUNT_MIN}% đến ${FLASH_SALE_DISCOUNT_MAX}%.`,
    };
  }

  return {
    valid: true,
    value: parsed,
  };
}

/**
 * Computes the rescue price in integer VND after applying a discount percentage.
 *
 * @param basePriceVnd Base product price in integer VND.
 * @param discountPercent Discount percentage (1-90).
 * @returns Rounded rescue price in integer VND.
 */
export function computeRescuePriceVnd(
  basePriceVnd: number,
  discountPercent: number,
): number {
  return Math.round(basePriceVnd * (1 - discountPercent / 100));
}

/**
 * Formats an integer VND amount with `vi-VN` grouping and `đ` suffix.
 *
 * @param amount Price in integer VND.
 * @returns Formatted VND string.
 */
export function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString("vi-VN")}đ`;
}

const EXPIRY_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
});

/**
 * Formats an ISO expiration timestamp for display in the near-expiry table.
 *
 * @param isoTimestamp ISO 8601 date-time string.
 * @returns Localized Vietnamese date-time string, or original input on invalid date.
 */
export function formatExpiryTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }
  return EXPIRY_TIMESTAMP_FORMATTER.format(date);
}
