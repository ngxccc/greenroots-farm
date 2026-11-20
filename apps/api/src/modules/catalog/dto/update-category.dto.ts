import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import { zSanitizedString, zUuidV7 } from "@/common/schemas/zod-primitives";
import {
  hasAtLeastOneDefinedField,
  zCatalogDescription,
  zCatalogSlug,
} from "./catalog-primitives";

/**
 * Zod schema for partial updates to an existing category (`PATCH /api/v1/categories/:id`).
 */
export const updateCategorySchema = z
  .object({
    name: zSanitizedString({ min: 1, max: 255 }).optional(),
    slug: zCatalogSlug().optional(),
    description: zCatalogDescription(),
    parentId: zUuidV7().nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => hasAtLeastOneDefinedField(data), {
    message: MESSAGES.VALIDATION.AT_LEAST_ONE_CATEGORY_FIELD,
  });

/**
 * Validated partial update payload for `PATCH /api/v1/categories/:id`.
 */
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/**
 * Request body DTO for `PATCH /api/v1/categories/:id`.
 */
export class UpdateCategoryDto extends createZodDto(updateCategorySchema) {
  public static readonly zodSchema = updateCategorySchema;
}
