import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { FarmingActionType } from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  zCloudinaryMediaUrl,
  zSanitizedString,
  zUuidV7,
} from "@/common/schemas/zod-primitives";

/**
 * Zod schema for appending an immutable farming log entry (`POST /api/v1/seasons/:id/logs`).
 */
export const createFarmingLogSchema = z
  .object({
    actionType: z.enum(FarmingActionType),
    description: zSanitizedString({ min: 1, max: 2000 }),
    mediaUrls: z
      .array(
        zCloudinaryMediaUrl({
          folder: "farming_logs",
          resourceTypes: ["image", "video"],
        }),
      )
      .max(3)
      .refine((urls) => new Set(urls).size === urls.length, {
        message: MESSAGES.VALIDATION.DUPLICATE_MEDIA_URL,
      })
      .optional(),
    correctsLogId: zUuidV7().optional(),
  })
  .strict();

/**
 * Validated payload for creating an append-only farming log entry.
 */
export type CreateFarmingLogInput = z.infer<typeof createFarmingLogSchema>;

/**
 * Request body DTO for `POST /api/v1/seasons/:id/logs`.
 */
export class CreateFarmingLogDto extends createZodDto(createFarmingLogSchema) {
  public static readonly zodSchema = createFarmingLogSchema;
}
