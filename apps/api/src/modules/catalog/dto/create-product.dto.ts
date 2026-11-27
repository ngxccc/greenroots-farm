import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import { zSanitizedString, zUuidV7 } from "@/common/schemas/zod-primitives";
import {
  zCatalogDescription,
  zCatalogSlug,
  zCatalogStorageInstructions,
  zProductImageUrls,
} from "./catalog-primitives";

/**
 * Zod schema for creating a catalog product (`POST /api/v1/products`).
 */
export const createProductSchema = z
  .object({
    categoryId: zUuidV7(),
    name: zSanitizedString({ min: 1, max: 255 }),
    slug: zCatalogSlug(),
    description: zCatalogDescription(),
    storageInstructions: zCatalogStorageInstructions(),
    basePriceVnd: z.number().int().min(0),
    salePriceVnd: z.number().int().min(0).nullable().optional(),
    unit: zSanitizedString({ min: 1, max: 50 }).default("kg"),
    imageUrls: zProductImageUrls().nullable().optional(),
    isVietGap: z.boolean().default(false),
    isUsda: z.boolean().default(false),
    isSubscriptionEligible: z.boolean().default(true),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine(
    (data) =>
      data.salePriceVnd === undefined ||
      data.salePriceVnd === null ||
      data.salePriceVnd <= data.basePriceVnd,
    {
      path: ["salePriceVnd"],
      message: MESSAGES.PRODUCTS.PRICE_INVALID,
    },
  );

/**
 * Validated payload for creating a product.
 */
export type CreateProductInput = z.infer<typeof createProductSchema>;

/**
 * Request body DTO for `POST /api/v1/products`.
 */
export class CreateProductDto extends createZodDto(createProductSchema) {
  public static readonly zodSchema = createProductSchema;
}
