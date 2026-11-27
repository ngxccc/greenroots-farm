import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { ANALYTICS_GRANULARITIES } from "../analytics.constant";
import { refineAnalyticsDateRange } from "../analytics.util";

/**
 * Zod schema for `GET /api/v1/analytics/finance` query parameters.
 */
export const financeAnalyticsQuerySchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    granularity: z.enum(ANALYTICS_GRANULARITIES).default("day"),
  })
  .strict()
  .superRefine(refineAnalyticsDateRange);

/** Validated query parameters for financial cashflow analytics. */
export type FinanceAnalyticsQuery = z.infer<typeof financeAnalyticsQuerySchema>;

/**
 * Query parameters DTO for `GET /api/v1/analytics/finance`.
 */
export class FinanceAnalyticsQueryDto extends createZodDto(
  financeAnalyticsQuerySchema,
) {
  public static readonly zodSchema = financeAnalyticsQuerySchema;
}
