import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { zUuidV7 } from "@/common/schemas/zod-primitives";

/**
 * Zod schema for the closed category projection returned by `/api/v1/categories*`
 * and `/api/v1/admin/categories*`, excluding `deletedAt`.
 */
export const categorySchema = z.object({
  id: zUuidV7(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  parentId: zUuidV7().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/**
 * Closed category projection type excluding `deletedAt`.
 */
export type CategoryProjection = z.infer<typeof categorySchema>;

/**
 * Response DTO for a single catalog category.
 */
export class CategoryDto extends createZodDto(categorySchema) {
  public static readonly zodSchema = categorySchema;
}
