import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import {
  FLASH_SALE_DISCOUNT_MAX,
  FLASH_SALE_DISCOUNT_MIN,
} from "../inventory.constant";
import { batchSchema } from "./batch.dto";

/**
 * Zod schema for a near-expiry batch projection returned by `GET /api/v1/inventory/near-expiry`.
 */
export const nearExpiryBatchSchema = batchSchema.extend({
  basePriceVnd: z.number().int().nonnegative(),
  salePriceVnd: z.number().int().nonnegative().nullable(),
  effectiveDiscountPercent: z
    .number()
    .int()
    .min(FLASH_SALE_DISCOUNT_MIN)
    .max(FLASH_SALE_DISCOUNT_MAX),
  rescuePriceVnd: z.number().int().nonnegative(),
  hoursRemaining: z.number().nonnegative(),
});

/** Closed near-expiry batch projection returned by `BatchesService.listNearExpiryBatches`. */
export type NearExpiryBatchProjection = z.infer<typeof nearExpiryBatchSchema>;

/**
 * Response DTO for a single near-expiry inventory batch.
 */
export class NearExpiryBatchDto extends createZodDto(nearExpiryBatchSchema) {
  public static readonly zodSchema = nearExpiryBatchSchema;
}
