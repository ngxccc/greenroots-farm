import { randomUUID } from "node:crypto";
import { env } from "@/common/config/env.config";
import type { DrizzleDB } from "@/database/database.module";
import {
  categories,
  products,
  type Category,
  type NewCategory,
  type NewProduct,
  type Product,
} from "@/database/schemas";

/**
 * Inserts a catalog category row with unique defaults for isolated integration tests.
 *
 * @param db Drizzle database client.
 * @param overrides Optional column overrides.
 * @returns Inserted `categories` row.
 */
export async function createCategory(
  db: DrizzleDB,
  overrides: Partial<NewCategory> = {},
): Promise<Category> {
  const uid = randomUUID().slice(0, 8).toLowerCase();

  const [category] = await db
    .insert(categories)
    .values({
      name: `Danh mục ${uid}`,
      slug: `danh-muc-${uid}`,
      description: `Mô tả danh mục ${uid}`,
      sortOrder: 0,
      isActive: true,
      ...overrides,
    })
    .returning();

  if (!category) {
    throw new Error("Failed to create Category entity in test factory");
  }

  return category;
}

/**
 * Named domain presets for catalog category test fixtures.
 */
export const CategoryMother = {
  /** Active root category (`parentId: null`). */
  root: (overrides: Partial<NewCategory> = {}): Partial<NewCategory> => ({
    parentId: null,
    isActive: true,
    ...overrides,
  }),

  /** Active child category linked to a root parent. */
  child: (
    parentId: string,
    overrides: Partial<NewCategory> = {},
  ): Partial<NewCategory> => ({
    parentId,
    isActive: true,
    ...overrides,
  }),

  /** Hidden inactive category preserving its slug. */
  inactive: (overrides: Partial<NewCategory> = {}): Partial<NewCategory> => ({
    isActive: false,
    ...overrides,
  }),

  /** Soft-deleted category excluded from live queries and releasing its slug. */
  softDeleted: (
    overrides: Partial<NewCategory> = {},
  ): Partial<NewCategory> => ({
    deletedAt: new Date(),
    ...overrides,
  }),
};

/**
 * Inserts a catalog product row, provisioning a parent category automatically if omitted.
 *
 * @param db Drizzle database client.
 * @param overrides Optional column overrides.
 * @returns Inserted `products` row.
 */
export async function createProduct(
  db: DrizzleDB,
  overrides: Partial<NewProduct> = {},
): Promise<Product> {
  const uid = randomUUID().slice(0, 8).toLowerCase();
  const categoryId = overrides.categoryId ?? (await createCategory(db)).id;
  const cloudName = env.CLOUDINARY_CLOUD_NAME;

  const [product] = await db
    .insert(products)
    .values({
      categoryId,
      name: `Sản phẩm ${uid}`,
      slug: `san-pham-${uid}`,
      description: `Mô tả sản phẩm ${uid}`,
      basePrice: 40000,
      salePrice: null,
      unit: "kg",
      imageUrls: [
        `https://res.cloudinary.com/${cloudName}/image/upload/v1/products/${uid}.webp`,
      ],
      isVietGap: false,
      isUsda: false,
      isSubscriptionEligible: true,
      isActive: true,
      ...overrides,
    })
    .returning();

  if (!product) {
    throw new Error("Failed to create Product entity in test factory");
  }

  return product;
}

/**
 * Named domain presets for catalog product test fixtures.
 */
export const ProductMother = {
  /** Active VietGAP product with catalog markdown price. */
  vietGapMarkdown: (
    overrides: Partial<NewProduct> = {},
  ): Partial<NewProduct> => ({
    basePrice: 50000,
    salePrice: 35000,
    isVietGap: true,
    isUsda: false,
    isActive: true,
    ...overrides,
  }),

  /** Active dual-certified VietGAP + USDA Organic product at regular price. */
  usdaOrganic: (overrides: Partial<NewProduct> = {}): Partial<NewProduct> => ({
    basePrice: 75000,
    salePrice: null,
    isVietGap: true,
    isUsda: true,
    isActive: true,
    ...overrides,
  }),

  /** Hidden inactive SKU preserving its slug. */
  inactive: (overrides: Partial<NewProduct> = {}): Partial<NewProduct> => ({
    isActive: false,
    ...overrides,
  }),

  /** Soft-deleted product excluded from catalog reads while retaining batch provenance. */
  softDeleted: (overrides: Partial<NewProduct> = {}): Partial<NewProduct> => ({
    deletedAt: new Date(),
    ...overrides,
  }),
};
