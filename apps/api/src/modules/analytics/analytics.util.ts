import type { z } from "zod";
import {
  ANALYTICS_DAY_MS,
  ANALYTICS_MAX_RANGE_DAYS,
  ANALYTICS_TIMEZONE_OFFSET_MS,
  type AnalyticsGranularity,
} from "./analytics.constant";

/**
 * Parses an ISO calendar date (`YYYY-MM-DD`) into a UTC midnight timestamp (ms).
 *
 * @param dateStr Calendar date formatted as `YYYY-MM-DD`.
 * @returns Epoch milliseconds at `00:00:00.000Z` for that calendar date.
 */
export function parseIsoDateToUtcMs(dateStr: string): number {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  return Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
}

/**
 * Formats a UTC midnight timestamp (ms) back to `YYYY-MM-DD`.
 *
 * @param utcMs Epoch milliseconds at UTC midnight.
 * @returns Calendar date formatted as `YYYY-MM-DD`.
 */
export function formatUtcMsToIsoDate(utcMs: number): string {
  const d = new Date(utcMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns today's calendar date (`YYYY-MM-DD`) in `Asia/Ho_Chi_Minh` (`UTC+07:00`).
 *
 * @param now Reference instant (defaults to `new Date()`).
 * @returns Current date string in `Asia/Ho_Chi_Minh`.
 */
export function getTodayInHoChiMinh(now: Date = new Date()): string {
  return formatUtcMsToIsoDate(now.getTime() + ANALYTICS_TIMEZONE_OFFSET_MS);
}

/**
 * Adds a signed number of calendar days to an ISO date (`YYYY-MM-DD`).
 *
 * @param dateStr Base calendar date (`YYYY-MM-DD`).
 * @param days Signed day delta.
 * @returns Shifted calendar date (`YYYY-MM-DD`).
 */
export function addDaysToIsoDate(dateStr: string, days: number): string {
  return formatUtcMsToIsoDate(
    parseIsoDateToUtcMs(dateStr) + days * ANALYTICS_DAY_MS,
  );
}

/**
 * Computes the inclusive number of calendar days between `from` and `to`.
 *
 * @param from Start date (`YYYY-MM-DD`).
 * @param to End date (`YYYY-MM-DD`).
 * @returns Inclusive day count `(to - from) + 1`.
 */
export function getInclusiveDaySpan(from: string, to: string): number {
  const diffDays = Math.round(
    (parseIsoDateToUtcMs(to) - parseIsoDateToUtcMs(from)) / ANALYTICS_DAY_MS,
  );
  return diffDays + 1;
}

/**
 * Converts a `YYYY-MM-DD` date in `Asia/Ho_Chi_Minh` (`UTC+07:00`) to its
 * exact `00:00:00+07:00` UTC `Date` instant.
 *
 * @param dateStr Calendar date (`YYYY-MM-DD`).
 * @returns UTC `Date` representing `00:00:00+07:00` on that day.
 */
export function hoChiMinhStartOfDayUtc(dateStr: string): Date {
  return new Date(parseIsoDateToUtcMs(dateStr) - ANALYTICS_TIMEZONE_OFFSET_MS);
}

/**
 * Returns the Monday-start ISO week date (`YYYY-MM-DD`) containing `dateStr`.
 *
 * @param dateStr Calendar date (`YYYY-MM-DD`).
 * @returns Monday `YYYY-MM-DD` of the ISO week.
 */
export function getIsoWeekMonday(dateStr: string): string {
  const utcMs = parseIsoDateToUtcMs(dateStr);
  const dayOfWeek = new Date(utcMs).getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return formatUtcMsToIsoDate(utcMs + offsetToMonday * ANALYTICS_DAY_MS);
}

/**
 * Generates an ordered list of contiguous bucket keys across `[from, to]`.
 *
 * @param from Inclusive start date (`YYYY-MM-DD`).
 * @param to Inclusive end date (`YYYY-MM-DD`).
 * @param granularity Target bucket granularity (`day` | `week` | `month`).
 * @returns Ordered bucket strings (`YYYY-MM-DD` for day/week, `YYYY-MM` for month).
 */
export function generateContiguousBuckets(
  from: string,
  to: string,
  granularity: AnalyticsGranularity,
): string[] {
  const buckets: string[] = [];

  if (granularity === "day") {
    let current = parseIsoDateToUtcMs(from);
    const end = parseIsoDateToUtcMs(to);
    while (current <= end) {
      buckets.push(formatUtcMsToIsoDate(current));
      current += ANALYTICS_DAY_MS;
    }
    return buckets;
  }

  if (granularity === "week") {
    let current = parseIsoDateToUtcMs(getIsoWeekMonday(from));
    const end = parseIsoDateToUtcMs(getIsoWeekMonday(to));
    while (current <= end) {
      buckets.push(formatUtcMsToIsoDate(current));
      current += 7 * ANALYTICS_DAY_MS;
    }
    return buckets;
  }

  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  let year = fromYear!;
  let month = fromMonth!;

  while (year < toYear! || (year === toYear! && month <= toMonth!)) {
    buckets.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return buckets;
}

/**
 * Rounds a non-negative quantity to 2 decimal places.
 *
 * @param value Raw numeric quantity.
 * @returns Quantity rounded to 2 decimal places.
 */
export function roundQuantity2dp(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Computes `discardedQuantity / initialQuantity` rounded to 4 decimal places,
 * returning `0` when `initialQuantity <= 0` (`INV-4`).
 *
 * @param discardedQuantity Approved discarded quantity.
 * @param initialQuantity Cohort initial harvested quantity.
 * @returns Ratio clamped to `[0, 1]` and rounded to 4 decimal places.
 */
export function computeWasteRatio(
  discardedQuantity: number,
  initialQuantity: number,
): number {
  if (initialQuantity <= 0) {
    return 0;
  }
  const ratio = discardedQuantity / initialQuantity;
  const clamped = Math.min(1, Math.max(0, ratio));
  return Math.round(clamped * 10000) / 10000;
}

/**
 * Zod `.superRefine` callback validating an optional `[from, to]` date window
 * against `ANALYTICS_MAX_RANGE_DAYS` in `Asia/Ho_Chi_Minh`.
 *
 * @param data Query object containing optional `from` and `to` ISO dates.
 * @param ctx Zod refinement context for attaching validation issues.
 */
export function refineAnalyticsDateRange(
  data: { from?: string; to?: string },
  ctx: z.RefinementCtx,
): void {
  if (data.from === undefined) {
    return;
  }

  const effectiveTo = data.to ?? getTodayInHoChiMinh();
  if (data.from > effectiveTo) {
    ctx.addIssue({
      code: "custom",
      path: ["to"],
      message: "from must be less than or equal to to.",
    });
    return;
  }

  if (getInclusiveDaySpan(data.from, effectiveTo) > ANALYTICS_MAX_RANGE_DAYS) {
    ctx.addIssue({
      code: "custom",
      path: ["to"],
      message: `Date range must not exceed ${ANALYTICS_MAX_RANGE_DAYS} days.`,
    });
  }
}
