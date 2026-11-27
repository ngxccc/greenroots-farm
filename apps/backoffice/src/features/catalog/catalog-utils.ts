import type { components } from "@/types/api-schema";

export type CategoryDto = components["schemas"]["CategoryDto"];
export type ProductDto = components["schemas"]["ProductDto"];
export type CreateCategoryDto = components["schemas"]["CreateCategoryDto"];
export type UpdateCategoryDto = components["schemas"]["UpdateCategoryDto"];
export type CreateProductDto = components["schemas"]["CreateProductDto"];
export type UpdateProductDto = components["schemas"]["UpdateProductDto"];

/** Maximum number of product images allowed per product. */
export const MAX_PRODUCT_IMAGES = 5;

/** Kebab-case slug pattern accepted by the catalog API. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Node in the two-level category hierarchy tree.
 */
export interface CategoryTreeNode {
  readonly category: CategoryDto;
  readonly children: readonly CategoryDto[];
}

/**
 * Lock evaluation describing whether a category can be soft-deleted.
 */
export interface CategoryDeleteLockState {
  readonly locked: boolean;
  readonly childCount: number;
  readonly productCount: number;
  readonly reason: string | null;
}

/**
 * Formats an integer VND amount with `vi-VN` grouping and `đ` suffix.
 *
 * @param amount Price in integer VND.
 * @returns Formatted VND string.
 */
export function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString("vi-VN")}đ`;
}

/**
 * Converts a Vietnamese display name into a URL-safe kebab-case slug.
 *
 * @param input Raw category or product name.
 * @returns Lowercase ASCII kebab-case slug.
 */
export function slugifyVietnamese(input: string): string {
  return input
    .normalize("NFD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .replaceAll("đ", "d")
    .replaceAll("Đ", "d")
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

/**
 * Validates product base and optional sale prices in integer VND.
 *
 * @param basePriceVnd Regular product price in VND.
 * @param salePriceVnd Optional promotional price in VND (`null` when unset).
 * @returns Localized Vietnamese error message, or `null` when valid.
 */
export function validateProductPrices(
  basePriceVnd: number,
  salePriceVnd: number | null,
): string | null {
  if (!Number.isInteger(basePriceVnd) || basePriceVnd <= 0) {
    return "Giá gốc phải là số nguyên dương (VNĐ).";
  }

  if (salePriceVnd === null) {
    return null;
  }

  if (!Number.isInteger(salePriceVnd) || salePriceVnd <= 0) {
    return "Giá khuyến mãi phải là số nguyên dương (VNĐ).";
  }

  if (salePriceVnd >= basePriceVnd) {
    return "Giá khuyến mãi phải nhỏ hơn giá gốc.";
  }

  return null;
}

/**
 * Validates product image list against the maximum allowed image count.
 *
 * @param imageUrls Current or candidate image URLs.
 * @returns Localized Vietnamese error message, or `null` when within limits.
 */
export function validateProductImages(
  imageUrls: readonly string[],
): string | null {
  if (imageUrls.length > MAX_PRODUCT_IMAGES) {
    return `Mỗi sản phẩm chỉ được tải lên tối đa ${MAX_PRODUCT_IMAGES} hình ảnh.`;
  }
  return null;
}

/**
 * Groups flat categories into a sorted two-level tree (root categories and their children).
 *
 * @param categories Flat list of categories from the API.
 * @returns Ordered root nodes with nested children.
 */
export function buildCategoryTree(
  categories: readonly CategoryDto[],
): CategoryTreeNode[] {
  const bySortAndName = (a: CategoryDto, b: CategoryDto) =>
    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "vi");

  const roots = categories.filter((cat) => !cat.parentId).sort(bySortAndName);
  const childrenByParent = new Map<string, CategoryDto[]>();

  for (const cat of categories) {
    if (!cat.parentId) continue;
    const list = childrenByParent.get(cat.parentId) ?? [];
    list.push(cat);
    childrenByParent.set(cat.parentId, list);
  }

  return roots.map((root) => ({
    category: root,
    children: (childrenByParent.get(root.id) ?? []).sort(bySortAndName),
  }));
}

/**
 * Counts how many products reference each category ID.
 *
 * @param products Loaded catalog products.
 * @returns Map from `categoryId` to product count.
 */
export function countProductsByCategory(
  products: readonly ProductDto[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const product of products) {
    counts.set(product.categoryId, (counts.get(product.categoryId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Determines whether a category is locked from deletion due to subcategories or products.
 *
 * @param categoryId Target category ID.
 * @param categories All non-deleted categories.
 * @param productCountByCategory Product count map keyed by `categoryId`.
 * @returns Lock state with counts and localized Vietnamese hint.
 */
export function getCategoryDeleteLockState(
  categoryId: string,
  categories: readonly CategoryDto[],
  productCountByCategory: ReadonlyMap<string, number>,
): CategoryDeleteLockState {
  const childCount = categories.filter((c) => c.parentId === categoryId).length;
  const productCount = productCountByCategory.get(categoryId) ?? 0;

  if (childCount > 0 && productCount > 0) {
    return {
      locked: true,
      childCount,
      productCount,
      reason: `Không thể xóa: còn ${childCount} danh mục con và ${productCount} sản phẩm.`,
    };
  }

  if (childCount > 0) {
    return {
      locked: true,
      childCount,
      productCount,
      reason: `Không thể xóa: còn ${childCount} danh mục con trực thuộc.`,
    };
  }

  if (productCount > 0) {
    return {
      locked: true,
      childCount,
      productCount,
      reason: `Không thể xóa: còn ${productCount} sản phẩm thuộc danh mục này.`,
    };
  }

  return {
    locked: false,
    childCount: 0,
    productCount: 0,
    reason: null,
  };
}

/**
 * Formats a product's two-level category breadcrumb label (e.g. `Rau ăn lá > Cải xanh`).
 *
 * @param product Product DTO containing category summary.
 * @param categoriesById Lookup map of all categories by ID.
 * @returns Human-readable category path in Vietnamese.
 */
export function formatProductCategoryPath(
  product: ProductDto,
  categoriesById: ReadonlyMap<string, CategoryDto>,
): string {
  const parentId = product.category.parentId;
  if (!parentId) {
    return product.category.name;
  }
  const parent = categoriesById.get(parentId);
  return parent
    ? `${parent.name} > ${product.category.name}`
    : product.category.name;
}
