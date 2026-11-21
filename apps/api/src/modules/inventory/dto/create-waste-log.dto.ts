import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  zCloudinaryMediaUrl,
  zSanitizedString,
  zUuidV7,
} from "@/common/schemas/zod-primitives";
import {
  WASTE_LOG_MAX_MEDIA_ITEMS,
  WASTE_LOG_MIN_MEDIA_ITEMS,
  WASTE_LOG_REASON_MAX_LENGTH,
} from "../inventory.constant";
import { zInventoryQuantity } from "./inventory-zod.util";

/**
 * Zod schema for creating a pending waste write-off proposal (`POST /api/v1/waste-logs`).
 */
export const createWasteLogSchema = z
  .object({
    batchId: zUuidV7(),
    discardedQuantity: zInventoryQuantity(),
    reason: zSanitizedString({ min: 1, max: WASTE_LOG_REASON_MAX_LENGTH }),
    mediaUrls: z
      .array(
        zCloudinaryMediaUrl({
          folder: "waste_logs",
          resourceTypes: ["image"],
        }),
      )
      .min(WASTE_LOG_MIN_MEDIA_ITEMS)
      .max(WASTE_LOG_MAX_MEDIA_ITEMS)
      .refine((urls) => new Set(urls).size === urls.length, {
        message: MESSAGES.VALIDATION.DUPLICATE_MEDIA_URL,
      }),
  })
  .strict();

/** Validated waste proposal payload consumed by `WasteLogsService`. */
export type CreateWasteLogInput = z.infer<typeof createWasteLogSchema>;

/**
 * Request body DTO for `POST /api/v1/waste-logs`.
 */
export class CreateWasteLogDto extends createZodDto(createWasteLogSchema) {
  public static readonly zodSchema = createWasteLogSchema;
}
