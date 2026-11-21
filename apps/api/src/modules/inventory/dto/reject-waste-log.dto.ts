import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { zSanitizedString } from "@/common/schemas/zod-primitives";
import { WASTE_LOG_REJECTION_REASON_MAX_LENGTH } from "../inventory.constant";

/**
 * Zod schema for rejecting a pending waste write-off proposal (`POST /api/v1/waste-logs/:id/reject`).
 */
export const rejectWasteLogSchema = z
  .object({
    rejectionReason: zSanitizedString({
      min: 1,
      max: WASTE_LOG_REJECTION_REASON_MAX_LENGTH,
    }),
  })
  .strict();

/** Validated rejection payload consumed by `WasteLogsService`. */
export type RejectWasteLogInput = z.infer<typeof rejectWasteLogSchema>;

/**
 * Request body DTO for `POST /api/v1/waste-logs/:id/reject`.
 */
export class RejectWasteLogDto extends createZodDto(rejectWasteLogSchema) {
  public static readonly zodSchema = rejectWasteLogSchema;
}
