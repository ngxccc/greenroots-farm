import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import {
  BATCH_MAX_QUANTITY,
  BATCH_MAX_SHELF_LIFE_DAYS,
  BATCH_MIN_QUANTITY,
} from "../inventory.interface";

/**
 * Zod schema for creating a harvested inventory batch (`POST /api/v1/batches`).
 * Client-supplied `batchCode`, `availableQuantity`, `expirationDate`, `status`,
 * and `qrCodeUrl` are rejected via `.strict()`.
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
    initialQuantity: z
      .number()
      .min(BATCH_MIN_QUANTITY, { message: MESSAGES.VALIDATION.MIN_VALUE })
      .max(BATCH_MAX_QUANTITY, { message: MESSAGES.VALIDATION.MAX_VALUE })
      .refine(
        (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
        {
          message: MESSAGES.VALIDATION.INVALID_QUANTITY_PRECISION,
        },
      ),
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
