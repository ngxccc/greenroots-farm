import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { SeasonStatus } from "@greenroots/shared";
import { zIsoDate, zUuidV7 } from "@/common/schemas/zod-primitives";

/**
 * Zod schema for the lightweight plot summary nested inside season responses.
 */
export const seasonPlotSummarySchema = z.object({
  id: zUuidV7(),
  plotCode: z.string(),
  name: z.string(),
  areaSqm: z.number(),
  deletedAt: z.iso.datetime().nullable(),
});

/**
 * Closed plot summary projection returned inside `SeasonProjection`.
 */
export type SeasonPlotSummary = z.infer<typeof seasonPlotSummarySchema>;

/**
 * Zod schema for the closed season projection returned by `/api/v1/seasons*`.
 */
export const seasonSchema = z.object({
  id: zUuidV7(),
  plotId: zUuidV7(),
  seasonName: z.string(),
  startDate: zIsoDate(),
  expectedHarvestDate: zIsoDate(),
  status: z.enum(SeasonStatus),
  plot: seasonPlotSummarySchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/**
 * Closed cultivation season projection including plot summary.
 */
export type SeasonProjection = z.infer<typeof seasonSchema>;

/**
 * Response DTO for a single cultivation season (`/api/v1/seasons`).
 */
export class SeasonDto extends createZodDto(seasonSchema) {
  public static readonly zodSchema = seasonSchema;
}
