import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { FarmingActionType } from "@greenroots/shared";
import { zUuidV7 } from "@/common/schemas/zod-primitives";

/**
 * Zod schema for the closed staff attribution summary attached to farming logs.
 */
export const farmingLogStaffSummarySchema = z.object({
  id: zUuidV7(),
  fullName: z.string(),
});

/**
 * Closed staff attribution summary projection.
 */
export type FarmingLogStaffSummary = z.infer<
  typeof farmingLogStaffSummarySchema
>;

/**
 * Zod schema for the lightweight target log summary referenced by `correctsLog`.
 */
export const farmingLogTargetSummarySchema = z.object({
  id: zUuidV7(),
  actionType: z.enum(FarmingActionType),
  description: z.string(),
  loggedAt: z.iso.datetime(),
});

/**
 * Lightweight projection of the farming log superseded by a correction entry.
 */
export type FarmingLogTargetSummary = z.infer<
  typeof farmingLogTargetSummarySchema
>;

/**
 * Zod schema for reverse correction references in `correctedBy`.
 */
export const farmingLogCorrectionRefSchema = z.object({
  id: zUuidV7(),
  loggedAt: z.iso.datetime(),
  staff: farmingLogStaffSummarySchema,
});

/**
 * Reverse reference to a correction log that targets this entry.
 */
export type FarmingLogCorrectionRef = z.infer<
  typeof farmingLogCorrectionRefSchema
>;

/**
 * Zod schema for the closed farming log projection returned by `/api/v1/seasons/:id/logs`.
 */
export const farmingLogSchema = z.object({
  id: zUuidV7(),
  seasonId: zUuidV7(),
  staffId: zUuidV7(),
  staff: farmingLogStaffSummarySchema,
  actionType: z.enum(FarmingActionType),
  description: z.string(),
  mediaUrls: z.array(z.string()),
  correctsLogId: zUuidV7().nullable(),
  correctsLog: farmingLogTargetSummarySchema.nullable(),
  correctedBy: z.array(farmingLogCorrectionRefSchema),
  loggedAt: z.iso.datetime(),
});

/**
 * Closed farming log projection with staff attribution and bidirectional correction linkage.
 */
export type FarmingLogProjection = z.infer<typeof farmingLogSchema>;

/**
 * Response DTO for a single append-only farming log entry (`/api/v1/seasons/:id/logs`).
 */
export class FarmingLogDto extends createZodDto(farmingLogSchema) {
  public static readonly zodSchema = farmingLogSchema;
}
