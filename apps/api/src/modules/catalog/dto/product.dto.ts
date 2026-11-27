import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { SELLABLE_BATCH_STATUSES } from "../catalog.constant";

/**
 * Closed summary of a product's assigned category.
 */
export const productCategorySummarySchema = z.object({
  id: zUuidV7(),
  name: z.string(),
  slug: z.string(),
  parentId: zUuidV7().nullable(),
});

/**
 * Zod schema for the closed product projection returned by `/api/v1/products*`
 * and `/api/v1/admin/products*`, excluding `deletedAt`.
 */
export const productSchema = z.object({
  id: zUuidV7(),
  categoryId: zUuidV7(),
  category: productCategorySummarySchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  storageInstructions: z.string().nullable(),
  basePriceVnd: z.number().int(),
  salePriceVnd: z.number().int().nullable(),
  availableQuantity: z.number().nonnegative(),
  unit: z.string(),
  imageUrls: z.array(z.string()),
  isVietGap: z.boolean(),
  isUsda: z.boolean(),
  isSubscriptionEligible: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/**
 * Redacted active FEFO batch trace summary exposed on public product detail.
 */
export const activeBatchTraceSchema = z.object({
  batchCode: z.string(),
  harvestDate: z.iso.datetime(),
  expirationDate: z.iso.datetime(),
  status: z.enum(SELLABLE_BATCH_STATUSES),
  plotCode: z.string(),
  plotName: z.string(),
});

/**
 * Redacted near-expiry rescue progress exposed when the active FEFO batch is `near_expiry`.
 */
export const rescueProgressSchema = z.object({
  expiresAt: z.iso.datetime(),
  claimedPercent: z.number().int().min(0).max(100),
});

/**
 * Zod schema for public product detail (`GET /api/v1/products/:slug`),
 * extending `productSchema` with nullable FEFO batch trace and rescue progress.
 */
export const productDetailSchema = productSchema.extend({
  activeBatchTrace: activeBatchTraceSchema.nullable(),
  rescueProgress: rescueProgressSchema.nullable(),
});

/**
 * Closed product category summary type.
 */
export type ProductCategorySummary = z.infer<
  typeof productCategorySummarySchema
>;

/**
 * Closed product projection type excluding `deletedAt`.
 */
export type ProductProjection = z.infer<typeof productSchema>;

/**
 * Redacted active FEFO batch trace summary type.
 */
export type ActiveBatchTrace = z.infer<typeof activeBatchTraceSchema>;

/**
 * Redacted near-expiry rescue progress type.
 */
export type RescueProgress = z.infer<typeof rescueProgressSchema>;

/**
 * Public product detail projection type returned by `GET /api/v1/products/:slug`.
 */
export type ProductDetailProjection = z.infer<typeof productDetailSchema>;

/**
 * Response DTO for a single catalog product.
 */
export class ProductDto extends createZodDto(productSchema) {
  public static readonly zodSchema = productSchema;
}

/**
 * Response DTO for public product detail (`GET /api/v1/products/:slug`).
 */
export class ProductDetailDto extends createZodDto(productDetailSchema) {
  public static readonly zodSchema = productDetailSchema;
}
