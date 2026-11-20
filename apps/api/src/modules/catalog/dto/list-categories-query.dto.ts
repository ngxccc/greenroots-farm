import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  zBooleanString,
  zNumericString,
  zSanitizedString,
  zUuidV7,
} from "@/common/schemas/zod-primitives";
import { CATEGORY_SORT_OPTIONS } from "../catalog.interface";

const baseListCategoriesShape = {
  q: zSanitizedString({ min: 1, max: 100 }).optional(),
  parentId: zUuidV7().optional(),
  rootOnly: zBooleanString().optional(),
  page: zNumericString({ integer: true, min: 1 }).default(1),
  limit: zNumericString({ integer: true, min: 1, max: 100 }).default(20),
  sort: z.enum(CATEGORY_SORT_OPTIONS).default("sortOrder:asc"),
};

function withCategoryFilterGuard<
  T extends z.ZodType<{ parentId?: string; rootOnly?: boolean }>,
>(schema: T) {
  return schema.refine(
    (data) => !(data.parentId !== undefined && data.rootOnly === true),
    {
      path: ["rootOnly"],
      message: MESSAGES.VALIDATION.CONFLICTING_ROOT_CATEGORY_FILTER,
    },
  );
}

/**
 * Zod schema for public paginated category listing (`GET /api/v1/categories`).
 */
export const listCategoriesQuerySchema = withCategoryFilterGuard(
  z.object(baseListCategoriesShape).strict(),
);

/**
 * Validated public category listing query parameters.
 */
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;

/**
 * Query parameters DTO for `GET /api/v1/categories`.
 */
export class ListCategoriesQueryDto extends createZodDto(
  listCategoriesQuerySchema,
) {
  public static readonly zodSchema = listCategoriesQuerySchema;
}

/**
 * Zod schema for backoffice paginated category listing (`GET /api/v1/admin/categories`).
 */
export const adminListCategoriesQuerySchema = withCategoryFilterGuard(
  z
    .object({
      ...baseListCategoriesShape,
      isActive: zBooleanString().optional(),
    })
    .strict(),
);

/**
 * Validated backoffice category listing query parameters.
 */
export type AdminListCategoriesQuery = z.infer<
  typeof adminListCategoriesQuerySchema
>;

/**
 * Query parameters DTO for `GET /api/v1/admin/categories`.
 */
export class AdminListCategoriesQueryDto extends createZodDto(
  adminListCategoriesQuerySchema,
) {
  public static readonly zodSchema = adminListCategoriesQuerySchema;
}
