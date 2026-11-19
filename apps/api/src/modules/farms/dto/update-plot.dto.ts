import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import { zSanitizedString } from "@/common/schemas/zod-primitives";
import {
  soilTestResultInputSchema,
  waterTestResultInputSchema,
} from "./create-plot.dto";

/**
 * Zod schema for updating an existing cultivation plot (`PATCH /api/v1/plots/:id`).
 */
export const updatePlotSchema = z
  .object({
    plotCode: zSanitizedString({ min: 1, max: 50 }).optional(),
    name: zSanitizedString({ min: 1, max: 255 }).optional(),
    areaSqm: z.number().min(0.01).max(10_000_000).optional(),
    soilTestResult: soilTestResultInputSchema.nullable().optional(),
    waterTestResult: waterTestResultInputSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (data) =>
      Object.values(data as Record<string, unknown>).some(
        (value) => value !== undefined,
      ),
    {
      message: MESSAGES.VALIDATION.AT_LEAST_ONE_PLOT_FIELD,
    },
  );

/**
 * Validated partial update payload for `PATCH /api/v1/plots/:id`.
 */
export type UpdatePlotInput = z.infer<typeof updatePlotSchema>;

/**
 * Request body DTO for `PATCH /api/v1/plots/:id`.
 */
export class UpdatePlotDto extends createZodDto(updatePlotSchema) {
  public static readonly zodSchema = updatePlotSchema;
}
