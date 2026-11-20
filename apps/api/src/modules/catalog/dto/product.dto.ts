import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { zUuidV7 } from "@/common/schemas/zod-primitives";

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
 * Response DTO for a single catalog product.
 */
export class ProductDto extends createZodDto(productSchema) {
  public static readonly zodSchema = productSchema;
}
