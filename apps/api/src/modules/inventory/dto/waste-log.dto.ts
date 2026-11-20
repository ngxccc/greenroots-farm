import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { BatchStatus, WasteLogStatus } from "@greenroots/shared";
import { zUuidV7 } from "@/common/schemas/zod-primitives";

/**
 * Closed summary of the batch linked to a waste log entry.
 */
export const wasteLogBatchSummarySchema = z.object({
  id: zUuidV7(),
  batchCode: z.string(),
  productId: zUuidV7(),
  productName: z.string(),
  unit: z.string(),
  status: z.enum(BatchStatus),
  availableQuantity: z.number(),
});

/**
 * Closed summary of a staff actor (reporter or reviewer) on a waste log entry.
 */
export const wasteLogUserSummarySchema = z.object({
  id: zUuidV7(),
  fullName: z.string(),
});

/**
 * Zod schema for the closed waste log projection returned by `/api/v1/waste-logs*`.
 */
export const wasteLogSchema = z.object({
  id: zUuidV7(),
  batchId: zUuidV7(),
  batch: wasteLogBatchSummarySchema,
  reporter: wasteLogUserSummarySchema,
  reviewer: wasteLogUserSummarySchema.nullable(),
  discardedQuantity: z.number(),
  reason: z.string(),
  rejectionReason: z.string().nullable(),
  mediaUrls: z.array(z.string()),
  status: z.enum(WasteLogStatus),
  reviewedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** Closed batch summary attached to a waste log projection. */
export type WasteLogBatchSummary = z.infer<typeof wasteLogBatchSummarySchema>;

/** Closed staff user summary attached to a waste log projection. */
export type WasteLogUserSummary = z.infer<typeof wasteLogUserSummarySchema>;

/** Closed waste log projection returned by `WasteLogsService`. */
export type WasteLogProjection = z.infer<typeof wasteLogSchema>;

/**
 * Response DTO for a single inventory waste log entry.
 */
export class WasteLogDto extends createZodDto(wasteLogSchema) {
  public static readonly zodSchema = wasteLogSchema;
}
