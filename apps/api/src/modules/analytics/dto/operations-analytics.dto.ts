import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import {
  ANALYTICS_GRANULARITIES,
  ANALYTICS_TIMEZONE,
} from "../analytics.constant";

/**
 * Zod schema for the resolved operational analytics reporting period.
 */
export const operationsAnalyticsPeriodSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  granularity: z.enum(ANALYTICS_GRANULARITIES),
  timezone: z.literal(ANALYTICS_TIMEZONE),
});

/**
 * Zod schema for aggregated operational KPIs without cashflow/discount leakage (`ADR-0048`).
 */
export const operationsAnalyticsSummarySchema = z.object({
  grossItemRevenueVnd: z.number().int().nonnegative(),
  deliveredOrderCount: z.number().int().nonnegative(),
  totalInitialQuantity: z.number().nonnegative(),
  totalDiscardedQuantity: z.number().nonnegative(),
  wasteRatio: z.number().min(0).max(1),
});

/**
 * Zod schema for one zero-filled revenue time-series bucket.
 */
export const revenueSeriesPointSchema = z.object({
  bucket: z.string(),
  grossItemRevenueVnd: z.number().int().nonnegative(),
  deliveredOrderCount: z.number().int().nonnegative(),
});

/**
 * Zod schema for one zero-filled harvest-cohort waste time-series bucket.
 */
export const wasteSeriesPointSchema = z.object({
  bucket: z.string(),
  initialQuantity: z.number().nonnegative(),
  discardedQuantity: z.number().nonnegative(),
  wasteRatio: z.number().min(0).max(1),
});

/**
 * Zod schema for one top-performing product ranked by `grossItemRevenueVnd`.
 */
export const topProductItemSchema = z.object({
  productId: zUuidV7(),
  productName: z.string(),
  unit: z.string(),
  totalQuantity: z.number().nonnegative(),
  grossItemRevenueVnd: z.number().int().nonnegative(),
});

/**
 * Zod schema for the `GET /api/v1/analytics/operations` response payload.
 */
export const operationsAnalyticsSchema = z.object({
  period: operationsAnalyticsPeriodSchema,
  summary: operationsAnalyticsSummarySchema,
  revenueSeries: z.array(revenueSeriesPointSchema),
  wasteSeries: z.array(wasteSeriesPointSchema),
  topProducts: z.array(topProductItemSchema),
});

/** Operational analytics response payload type. */
export type OperationsAnalytics = z.infer<typeof operationsAnalyticsSchema>;

/**
 * Response DTO for `GET /api/v1/analytics/operations`.
 */
export class OperationsAnalyticsDto extends createZodDto(
  operationsAnalyticsSchema,
) {
  public static readonly zodSchema = operationsAnalyticsSchema;
}
