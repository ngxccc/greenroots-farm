import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import {
  ANALYTICS_GRANULARITIES,
  ANALYTICS_MAX_RANGE_DAYS,
} from "../analytics.constant";
import { getInclusiveDaySpan, getTodayInHoChiMinh } from "../analytics.util";

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
  .superRefine((data, ctx) => {
    const effectiveTo = data.to ?? getTodayInHoChiMinh();
    if (data.from !== undefined) {
      if (data.from > effectiveTo) {
        ctx.addIssue({
          code: "custom",
          path: ["to"],
          message: "from must be less than or equal to to.",
        });
        return;
      }

      if (
        getInclusiveDaySpan(data.from, effectiveTo) > ANALYTICS_MAX_RANGE_DAYS
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["to"],
          message: `Date range must not exceed ${ANALYTICS_MAX_RANGE_DAYS} days.`,
        });
      }
    }
  });

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
