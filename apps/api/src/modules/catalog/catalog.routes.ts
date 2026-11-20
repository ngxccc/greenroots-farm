/**
 * Centralized route and Swagger tag constants for the Catalog Module.
 * Conforms to docs/standards/api-design-and-error-handling.md §8.
 */
export const CATALOG_ROUTES = Object.freeze({
  TAG: "catalog",
  CATEGORIES_BASE: "categories",
  CATEGORY_BY_ID: ":id",
  PRODUCTS_BASE: "products",
  PRODUCT_BY_SLUG: ":slug",
  PRODUCT_BY_ID: ":id",
  ADMIN_CATEGORIES_BASE: "admin/categories",
  ADMIN_PRODUCTS_BASE: "admin/products",
} as const);
