import { UserRole } from "@greenroots/shared";
import type { components, paths } from "@/types/api-schema";

/**
 * Operational analytics payload returned by `GET /api/v1/analytics/operations`.
 */
export type OperationsAnalyticsDto =
  components["schemas"]["OperationsAnalyticsDto"];

/**
 * Time bucket granularity supported by the operational analytics endpoint.
 */
export type OperationsGranularity =
  OperationsAnalyticsDto["period"]["granularity"];

/**
 * Supported quick-select period presets for the operational analytics filter bar.
 */
export type OperationsPeriodPreset = "7d" | "30d" | "90d" | "custom";

/**
 * Query parameters accepted by `GET /api/v1/analytics/operations`.
 */
export type OperationsAnalyticsQuery = NonNullable<
  paths["/api/v1/analytics/operations"]["get"]["parameters"]["query"]
>;

/**
 * Vietnamese display labels for time-bucket granularities.
 */
export const GRANULARITY_LABELS: Record<OperationsGranularity, string> = {
  day: "Theo ngày",
  week: "Theo tuần",
  month: "Theo tháng",
};

/**
 * Vietnamese display labels for quick-select period presets.
 */
export const PERIOD_PRESET_LABELS: Record<OperationsPeriodPreset, string> = {
  "7d": "7 ngày qua",
  "30d": "30 ngày qua",
  "90d": "90 ngày qua",
  custom: "Tùy chọn ngày",
};

const PRESET_DAYS: Record<Exclude<OperationsPeriodPreset, "custom">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/**
 * Checks whether an internal staff role is permitted to view operational analytics.
 *
 * @param role Active user role from the backoffice auth store.
 * @returns `true` only for `admin` and `super_admin`.
 */
export function canAccessOperationsAnalytics(
  role: UserRole | undefined | null,
): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}

/**
 * Formats a `Date` as a local `YYYY-MM-DD` calendar date string.
 *
 * @param date Local date instance.
 * @returns Calendar date in `YYYY-MM-DD` format.
 */
export function formatDateIsoLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Resolves inclusive `[from, to]` calendar dates for a quick-select period preset.
 *
 * @param preset Quick-select period (`7d`, `30d`, or `90d`).
 * @param referenceDate Anchor date representing "today" (defaults to current date).
 * @returns Inclusive `from` and `to` dates in `YYYY-MM-DD` format.
 */
export function resolvePeriodRange(
  preset: Exclude<OperationsPeriodPreset, "custom">,
  referenceDate: Date = new Date(),
): { readonly from: string; readonly to: string } {
  const end = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  const start = new Date(end);
  start.setDate(start.getDate() - (PRESET_DAYS[preset] - 1));

  return {
    from: formatDateIsoLocal(start),
    to: formatDateIsoLocal(end),
  };
}

/**
 * Builds typed query parameters for `GET /api/v1/analytics/operations`.
 *
 * @param params Filter bar state and optional reference date.
 * @returns Sanitized query parameters object.
 */
export function buildOperationsAnalyticsQuery(params: {
  readonly preset: OperationsPeriodPreset;
  readonly from?: string;
  readonly to?: string;
  readonly granularity: OperationsGranularity;
  readonly topLimit?: number;
  readonly referenceDate?: Date;
}): OperationsAnalyticsQuery {
  const topLimit = params.topLimit ?? 10;

  if (params.preset !== "custom") {
    const range = resolvePeriodRange(params.preset, params.referenceDate);
    return {
      from: range.from,
      to: range.to,
      granularity: params.granularity,
      topLimit,
    };
  }

  const trimmedFrom = params.from?.trim();
  const trimmedTo = params.to?.trim();

  return {
    ...(trimmedFrom ? { from: trimmedFrom } : {}),
    ...(trimmedTo ? { to: trimmedTo } : {}),
    granularity: params.granularity,
    topLimit,
  };
}

/**
 * Formats an integer VND amount with `vi-VN` grouping and `đ` suffix.
 *
 * @param amount Price or revenue in integer VND.
 * @returns Formatted VND string.
 */
export function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString("vi-VN")}đ`;
}

/**
 * Formats a VND amount into a compact Vietnamese axis tick label.
 *
 * @param amount Revenue in integer VND.
 * @returns Compact axis label (for example `1,5 tr` or `500k`).
 */
export function formatCompactVnd(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    const formatted = Number.isInteger(millions)
      ? String(millions)
      : millions.toFixed(1).replace(".", ",");
    return `${formatted} tr`;
  }
  if (amount >= 1_000) {
    return `${Math.round(amount / 1_000)}k`;
  }
  return `${Math.round(amount)}đ`;
}

/**
 * Formats a non-negative integer count with `vi-VN` grouping.
 *
 * @param value Numeric count or quantity.
 * @returns Formatted integer string.
 */
export function formatInteger(value: number): string {
  return Math.round(value).toLocaleString("vi-VN");
}

/**
 * Formats a `[0, 1]` waste ratio fraction into a Vietnamese percentage string.
 *
 * @param ratio Waste ratio in `[0, 1]` (for example `0.014` -> `1,4%`).
 * @returns Formatted percentage string.
 */
export function formatWasteRatioPercent(ratio: number): string {
  const bounded = Math.min(1, Math.max(0, ratio));
  const percent = bounded * 100;
  return `${percent.toLocaleString("vi-VN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}
