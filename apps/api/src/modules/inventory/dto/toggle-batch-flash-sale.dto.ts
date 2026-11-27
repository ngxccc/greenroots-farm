import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  FLASH_SALE_DISCOUNT_MAX,
  FLASH_SALE_DISCOUNT_MIN,
} from "../inventory.constant";

/**
 * Zod schema for `PATCH /api/v1/batches/:id/flash-sale`.
 */
export const toggleBatchFlashSaleSchema = z
  .object({
    enabled: z.boolean(),
    discountPercent: z
      .number()
      .int({ message: MESSAGES.VALIDATION.INTEGER })
      .min(FLASH_SALE_DISCOUNT_MIN, { message: MESSAGES.VALIDATION.MIN_VALUE })
      .max(FLASH_SALE_DISCOUNT_MAX, { message: MESSAGES.VALIDATION.MAX_VALUE })
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.enabled && data.discountPercent !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["discountPercent"],
        message: MESSAGES.VALIDATION.DISCOUNT_PERCENT_WHEN_DISABLED,
      });
    }
  });

/** Validated payload for toggling batch-level Rescue Flash Sale eligibility. */
export type ToggleBatchFlashSaleInput = z.infer<
  typeof toggleBatchFlashSaleSchema
>;

/**
 * Request DTO for `PATCH /api/v1/batches/:id/flash-sale`.
 */
export class ToggleBatchFlashSaleDto extends createZodDto(
  toggleBatchFlashSaleSchema,
) {
  public static readonly zodSchema = toggleBatchFlashSaleSchema;
}
