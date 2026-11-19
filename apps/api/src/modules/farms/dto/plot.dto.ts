import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { zUuidV7 } from "@/common/schemas/zod-primitives";

/**
 * Zod schema for serialized heavy-metals laboratory measurements.
 */
export const heavyMetalsTestSchema = z.object({
  lead_ppm: z.number(),
  cadmium_ppm: z.number(),
  pass: z.boolean(),
});

/**
 * Zod schema for serialized `SoilTestResult` JSONB payloads on plots.
 */
export const soilTestResultSchema = z.object({
  ph: z.number(),
  nitrogen_ppm: z.number(),
  phosphorus_ppm: z.number(),
  potassium_ppm: z.number(),
  heavy_metals: heavyMetalsTestSchema,
  tested_at: z.string(),
  certificate_url: z.string().optional(),
});

/**
 * Zod schema for serialized `WaterTestResult` JSONB payloads on plots.
 */
export const waterTestResultSchema = z.object({
  ph: z.number(),
  ec_ms_cm: z.number(),
  dissolved_oxygen_ppm: z.number(),
  e_coli_cfu_100ml: z.number(),
  heavy_metals_pass: z.boolean(),
  tested_at: z.string(),
  certificate_url: z.string().optional(),
});

/**
 * Zod schema for the closed plot projection returned by `/api/v1/plots*`.
 */
export const plotSchema = z.object({
  id: zUuidV7(),
  farmId: zUuidV7(),
  plotCode: z.string(),
  name: z.string(),
  areaSqm: z.number(),
  soilTestResult: soilTestResultSchema.nullable(),
  waterTestResult: waterTestResultSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/**
 * Closed plot projection type excluding `deletedAt`.
 */
export type PlotProjection = z.infer<typeof plotSchema>;

/**
 * Response DTO for a single cultivation plot (`/api/v1/plots`).
 */
export class PlotDto extends createZodDto(plotSchema) {
  public static readonly zodSchema = plotSchema;
}
