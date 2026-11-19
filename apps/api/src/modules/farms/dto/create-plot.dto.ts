import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import {
  zCloudinaryImageUrl,
  zSanitizedString,
} from "@/common/schemas/zod-primitives";

/**
 * Strict input schema for heavy-metals soil test telemetry.
 */
export const heavyMetalsInputSchema = z
  .object({
    lead_ppm: z.number().min(0),
    cadmium_ppm: z.number().min(0),
    pass: z.boolean(),
  })
  .strict();

/**
 * Strict input schema for `SoilTestResult` JSONB payloads.
 */
export const soilTestResultInputSchema = z
  .object({
    ph: z.number().min(0).max(14),
    nitrogen_ppm: z.number().min(0),
    phosphorus_ppm: z.number().min(0),
    potassium_ppm: z.number().min(0),
    heavy_metals: heavyMetalsInputSchema,
    tested_at: z.iso.datetime(),
    certificate_url: zCloudinaryImageUrl().optional(),
  })
  .strict();

/**
 * Strict input schema for `WaterTestResult` JSONB payloads.
 */
export const waterTestResultInputSchema = z
  .object({
    ph: z.number().min(0).max(14),
    ec_ms_cm: z.number().min(0),
    dissolved_oxygen_ppm: z.number().min(0),
    e_coli_cfu_100ml: z.number().min(0),
    heavy_metals_pass: z.boolean(),
    tested_at: z.iso.datetime(),
    certificate_url: zCloudinaryImageUrl().optional(),
  })
  .strict();

/**
 * Zod schema for creating a cultivation plot (`POST /api/v1/plots`).
 */
export const createPlotSchema = z
  .object({
    plotCode: zSanitizedString({ min: 1, max: 50 }),
    name: zSanitizedString({ min: 1, max: 255 }),
    areaSqm: z.number().min(0.01).max(10_000_000),
    soilTestResult: soilTestResultInputSchema.nullable().optional(),
    waterTestResult: waterTestResultInputSchema.nullable().optional(),
  })
  .strict();

/**
 * Validated payload for creating a plot.
 */
export type CreatePlotInput = z.infer<typeof createPlotSchema>;

/**
 * Request body DTO for `POST /api/v1/plots`.
 */
export class CreatePlotDto extends createZodDto(createPlotSchema) {
  public static readonly zodSchema = createPlotSchema;
}
