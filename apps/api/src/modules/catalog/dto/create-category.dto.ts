import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { zSanitizedString, zUuidV7 } from "@/common/schemas/zod-primitives";
import { zCatalogDescription, zCatalogSlug } from "./catalog-primitives";

/**
 * Zod schema for creating a catalog category (`POST /api/v1/categories`).
 */
export const createCategorySchema = z
  .object({
    name: zSanitizedString({ min: 1, max: 255 }),
    slug: zCatalogSlug(),
    description: zCatalogDescription(),
    parentId: zUuidV7().nullable().optional(),
    sortOrder: z.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
  })
  .strict();

/**
 * Validated payload for creating a category.
 */
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

/**
 * Request body DTO for `POST /api/v1/categories`.
 */
export class CreateCategoryDto extends createZodDto(createCategorySchema) {
  public static readonly zodSchema = createCategorySchema;
}
