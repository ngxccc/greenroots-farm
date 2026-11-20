import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import { zSanitizedString, zUuidV7 } from "@/common/schemas/zod-primitives";
import {
  hasAtLeastOneDefinedField,
  zCatalogDescription,
  zCatalogSlug,
  zProductImageUrls,
} from "./catalog-primitives";

/**
 * Zod schema for partial updates to an existing product (`PATCH /api/v1/products/:id`).
 */
export const updateProductSchema = z
  .object({
    categoryId: zUuidV7().optional(),
    name: zSanitizedString({ min: 1, max: 255 }).optional(),
    slug: zCatalogSlug().optional(),
    description: zCatalogDescription(),
    basePriceVnd: z.number().int().min(0).optional(),
    salePriceVnd: z.number().int().min(0).nullable().optional(),
    unit: zSanitizedString({ min: 1, max: 50 }).optional(),
    imageUrls: zProductImageUrls().nullable().optional(),
    isVietGap: z.boolean().optional(),
    isUsda: z.boolean().optional(),
    isSubscriptionEligible: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => hasAtLeastOneDefinedField(data), {
    message: MESSAGES.VALIDATION.AT_LEAST_ONE_PRODUCT_FIELD,
  })
  .refine(
    (data) =>
      data.basePriceVnd === undefined ||
      data.salePriceVnd === undefined ||
      data.salePriceVnd === null ||
      data.salePriceVnd <= data.basePriceVnd,
    {
      path: ["salePriceVnd"],
      message: MESSAGES.PRODUCTS.PRICE_INVALID,
    },
  );

/**
 * Validated partial update payload for `PATCH /api/v1/products/:id`.
 */
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/**
 * Request body DTO for `PATCH /api/v1/products/:id`.
 */
export class UpdateProductDto extends createZodDto(updateProductSchema) {
  public static readonly zodSchema = updateProductSchema;
}
