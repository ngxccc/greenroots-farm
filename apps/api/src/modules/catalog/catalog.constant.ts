import { BatchStatus } from "@greenroots/shared";

/**
 * Strict lowercase kebab-case slug format (`ca-chua-bi-huu-co`).
 */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Sellable batch statuses eligible for active FEFO stock and trace projection.
 */
export const SELLABLE_BATCH_STATUSES = [
  BatchStatus.IN_STOCK,
  BatchStatus.NEAR_EXPIRY,
] as const;

/**
 * Narrowed batch status union for sellable FEFO batches.
 */
export type SellableBatchStatus = (typeof SELLABLE_BATCH_STATUSES)[number];

/**
 * Maximum Cloudinary product gallery images stored per product.
 */
export const MAX_PRODUCT_IMAGES = 5;

/**
 * Maximum description length for catalog categories and products.
 */
export const MAX_CATALOG_DESCRIPTION_LENGTH = 5000;

/**
 * Maximum storage instructions length for catalog products.
 */
export const MAX_STORAGE_INSTRUCTIONS_LENGTH = 1000;

/**
 * Whitelisted sort expressions for `GET /api/v1/categories` and `GET /api/v1/admin/categories`.
 */
export const CATEGORY_SORT_OPTIONS = [
  "sortOrder:asc",
  "sortOrder:desc",
  "name:asc",
  "name:desc",
  "createdAt:desc",
] as const;

/**
 * Allowed sort options for catalog category listing endpoints.
 */
export type CategorySortOption = (typeof CATEGORY_SORT_OPTIONS)[number];

/**
 * Whitelisted sort expressions for `GET /api/v1/products` and `GET /api/v1/admin/products`.
 */
export const PRODUCT_SORT_OPTIONS = [
  "createdAt:desc",
  "createdAt:asc",
  "price:asc",
  "price:desc",
  "name:asc",
  "name:desc",
] as const;

/**
 * Allowed sort options for catalog product listing endpoints.
 */
export type ProductSortOption = (typeof PRODUCT_SORT_OPTIONS)[number];
