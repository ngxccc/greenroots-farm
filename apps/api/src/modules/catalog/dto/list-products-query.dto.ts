import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  zBooleanString,
  zNumericString,
  zSanitizedString,
  zUuidV7,
} from "@/common/schemas/zod-primitives";
import { PRODUCT_SORT_OPTIONS } from "../catalog.interface";
import { zCatalogSlug } from "./catalog-primitives";

const baseListProductsShape = {
  q: zSanitizedString({ min: 1, max: 100 }).optional(),
  categoryId: zUuidV7().optional(),
  categorySlug: zCatalogSlug().optional(),
  isVietGap: zBooleanString().optional(),
  isUsda: zBooleanString().optional(),
  isSubscriptionEligible: zBooleanString().optional(),
  minPriceVnd: zNumericString({ integer: true, min: 0 }).optional(),
  maxPriceVnd: zNumericString({ integer: true, min: 0 }).optional(),
  page: zNumericString({ integer: true, min: 1 }).default(1),
  limit: zNumericString({ integer: true, min: 1, max: 100 }).default(20),
  sort: z.enum(PRODUCT_SORT_OPTIONS).default("createdAt:desc"),
};

function withProductQueryGuards<
  T extends z.ZodType<{
    categoryId?: string;
    categorySlug?: string;
    minPriceVnd?: number;
    maxPriceVnd?: number;
  }>,
>(schema: T) {
  return schema
    .refine(
      (data) =>
        !(data.categoryId !== undefined && data.categorySlug !== undefined),
      {
        path: ["categorySlug"],
        message: MESSAGES.VALIDATION.CONFLICTING_CATEGORY_FILTER,
      },
    )
    .refine(
      (data) =>
        data.minPriceVnd === undefined ||
        data.maxPriceVnd === undefined ||
        data.minPriceVnd <= data.maxPriceVnd,
      {
        path: ["minPriceVnd"],
        message: MESSAGES.VALIDATION.PRICE_RANGE_INVALID,
      },
    );
}

/**
 * Zod schema for public paginated product listing (`GET /api/v1/products`).
 */
export const listProductsQuerySchema = withProductQueryGuards(
  z.object(baseListProductsShape).strict(),
);

/**
 * Validated public product listing query parameters.
 */
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

/**
 * Query parameters DTO for `GET /api/v1/products`.
 */
export class ListProductsQueryDto extends createZodDto(
  listProductsQuerySchema,
) {
  public static readonly zodSchema = listProductsQuerySchema;
}

/**
 * Zod schema for backoffice paginated product listing (`GET /api/v1/admin/products`).
 */
export const adminListProductsQuerySchema = withProductQueryGuards(
  z
    .object({
      ...baseListProductsShape,
      isActive: zBooleanString().optional(),
    })
    .strict(),
);

/**
 * Validated backoffice product listing query parameters.
 */
export type AdminListProductsQuery = z.infer<
  typeof adminListProductsQuerySchema
>;

/**
 * Query parameters DTO for `GET /api/v1/admin/products`.
 */
export class AdminListProductsQueryDto extends createZodDto(
  adminListProductsQuerySchema,
) {
  public static readonly zodSchema = adminListProductsQuerySchema;
}
