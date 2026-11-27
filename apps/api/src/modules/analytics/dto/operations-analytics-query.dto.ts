import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { zNumericString } from "@/common/schemas/zod-primitives";
import {
  ANALYTICS_DEFAULT_TOP_LIMIT,
  ANALYTICS_GRANULARITIES,
  ANALYTICS_MAX_RANGE_DAYS,
  ANALYTICS_MAX_TOP_LIMIT,
} from "../analytics.constant";
import { getInclusiveDaySpan, getTodayInHoChiMinh } from "../analytics.util";

/**
 * Zod schema for `GET /api/v1/analytics/operations` query parameters.
 */
export const operationsAnalyticsQuerySchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    granularity: z.enum(ANALYTICS_GRANULARITIES).default("day"),
    topLimit: zNumericString({
      integer: true,
      min: 1,
      max: ANALYTICS_MAX_TOP_LIMIT,
    }).default(ANALYTICS_DEFAULT_TOP_LIMIT),
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

/** Validated query parameters for operational analytics. */
export type OperationsAnalyticsQuery = z.infer<
  typeof operationsAnalyticsQuerySchema
>;

/**
 * Query parameters DTO for `GET /api/v1/analytics/operations`.
 */
export class OperationsAnalyticsQueryDto extends createZodDto(
  operationsAnalyticsQuerySchema,
) {
  public static readonly zodSchema = operationsAnalyticsQuerySchema;
}
