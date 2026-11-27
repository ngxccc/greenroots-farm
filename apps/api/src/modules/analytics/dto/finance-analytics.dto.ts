import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import {
  ANALYTICS_GRANULARITIES,
  ANALYTICS_TIMEZONE,
} from "../analytics.constant";

/**
 * Zod schema for the resolved financial cashflow analytics reporting period.
 */
export const financeAnalyticsPeriodSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  granularity: z.enum(ANALYTICS_GRANULARITIES),
  timezone: z.literal(ANALYTICS_TIMEZONE),
});

/**
 * Zod schema for cash-basis PayOS vs. COD summary KPIs and live pending COD snapshot (`ADR-0049`).
 */
export const financeAnalyticsSummarySchema = z.object({
  payosInflowVnd: z.number().int().nonnegative(),
  payosOrderInflowVnd: z.number().int().nonnegative(),
  payosSubscriptionInflowVnd: z.number().int().nonnegative(),
  payosOutflowVnd: z.number().int().nonnegative(),
  payosNetVnd: z.number().int(),
  codInflowVnd: z.number().int().nonnegative(),
  codOutflowVnd: z.number().int().nonnegative(),
  codNetVnd: z.number().int(),
  totalInflowVnd: z.number().int().nonnegative(),
  totalOutflowVnd: z.number().int().nonnegative(),
  netCashflowVnd: z.number().int(),
  pendingCodReceivableVnd: z.number().int().nonnegative(),
});

/**
 * Zod schema for one zero-filled cashflow time-series bucket.
 */
export const cashflowSeriesPointSchema = z.object({
  bucket: z.string(),
  payosInflowVnd: z.number().int().nonnegative(),
  payosOutflowVnd: z.number().int().nonnegative(),
  payosNetVnd: z.number().int(),
  codInflowVnd: z.number().int().nonnegative(),
  codOutflowVnd: z.number().int().nonnegative(),
  codNetVnd: z.number().int(),
  netCashflowVnd: z.number().int(),
});

/**
 * Zod schema for the `GET /api/v1/analytics/finance` response payload.
 */
export const financeAnalyticsSchema = z.object({
  period: financeAnalyticsPeriodSchema,
  summary: financeAnalyticsSummarySchema,
  cashflowSeries: z.array(cashflowSeriesPointSchema),
});

/** Financial cashflow analytics response payload type. */
export type FinanceAnalytics = z.infer<typeof financeAnalyticsSchema>;

/**
 * Response DTO for `GET /api/v1/analytics/finance`.
 */
export class FinanceAnalyticsDto extends createZodDto(financeAnalyticsSchema) {
  public static readonly zodSchema = financeAnalyticsSchema;
}
