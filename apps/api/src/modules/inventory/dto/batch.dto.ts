import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { BatchStatus } from "@greenroots/shared";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import {
  FLASH_SALE_DISCOUNT_MAX,
  FLASH_SALE_DISCOUNT_MIN,
} from "../inventory.constant";

/**
 * Closed summary of the product linked to a harvested batch.
 */
export const batchProductSummarySchema = z.object({
  id: zUuidV7(),
  name: z.string(),
  slug: z.string(),
  unit: z.string(),
});

/**
 * Closed summary of the cultivation season linked to a harvested batch.
 */
export const batchSeasonSummarySchema = z.object({
  id: zUuidV7(),
  seasonName: z.string(),
  plotId: zUuidV7(),
});

/**
 * Zod schema for the closed batch projection returned by `/api/v1/batches*`.
 */
export const batchSchema = z.object({
  id: zUuidV7(),
  batchCode: z.string(),
  productId: zUuidV7(),
  seasonId: zUuidV7(),
  product: batchProductSummarySchema,
  season: batchSeasonSummarySchema,
  harvestDate: z.iso.datetime(),
  expirationDate: z.iso.datetime(),
  initialQuantity: z.number(),
  availableQuantity: z.number(),
  status: z.enum(BatchStatus),
  isFlashSale: z.boolean(),
  flashSaleDiscountPercent: z
    .number()
    .int()
    .min(FLASH_SALE_DISCOUNT_MIN)
    .max(FLASH_SALE_DISCOUNT_MAX)
    .nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** Closed product summary attached to a batch projection. */
export type BatchProductSummary = z.infer<typeof batchProductSummarySchema>;

/** Closed season summary attached to a batch projection. */
export type BatchSeasonSummary = z.infer<typeof batchSeasonSummarySchema>;

/** Closed batch projection returned by `BatchesService`. */
export type BatchProjection = z.infer<typeof batchSchema>;

/**
 * Response DTO for a single inventory batch.
 */
export class BatchDto extends createZodDto(batchSchema) {
  public static readonly zodSchema = batchSchema;
}
