import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { BATCH_MAX_SHELF_LIFE_DAYS } from "../inventory.constant";
import { zInventoryQuantity } from "./inventory-zod.util";

/**
 * Zod schema for creating a harvested inventory batch (`POST /api/v1/batches`).
 * Server-owned fields (`batchCode`, `availableQuantity`, `expirationDate`, `status`)
 * and unknown keys (including legacy `qrCodeUrl`) are rejected via `.strict()`.
 */
export const createBatchSchema = z
  .object({
    productId: zUuidV7(),
    seasonId: zUuidV7(),
    harvestDate: z.iso.datetime({ offset: true }).meta({
      format: "date-time",
      example: "2026-11-20T04:00:00+07:00",
    }),
    shelfLifeDays: z
      .number()
      .int({ message: MESSAGES.VALIDATION.INTEGER })
      .min(1, { message: MESSAGES.VALIDATION.MIN_VALUE })
      .max(BATCH_MAX_SHELF_LIFE_DAYS, {
        message: MESSAGES.VALIDATION.MAX_VALUE,
      }),
    initialQuantity: zInventoryQuantity(),
  })
  .strict();

/** Validated batch intake payload consumed by `BatchesService`. */
export type CreateBatchInput = z.infer<typeof createBatchSchema>;

/**
 * Request body DTO for `POST /api/v1/batches`.
 */
export class CreateBatchDto extends createZodDto(createBatchSchema) {
  public static readonly zodSchema = createBatchSchema;
}
