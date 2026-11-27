import { describe, expect, it } from "bun:test";
import {
  buildCategoryTree,
  type CategoryDto,
  getCategoryDeleteLockState,
  MAX_PRODUCT_IMAGES,
  slugifyVietnamese,
  validateProductImages,
  validateProductPrices,
} from "./catalog-utils";

function makeCategory(
  overrides: Partial<CategoryDto> & Pick<CategoryDto, "id" | "name" | "slug">,
): CategoryDto {
  return {
    description: null,
    parentId: null,
    sortOrder: 0,
    isActive: true,
    createdAt: "2026-11-27T00:00:00.000Z",
    updatedAt: "2026-11-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("CatalogUtils", () => {
  describe("slugifyVietnamese", () => {
    it("normalizes Vietnamese diacritics and đ into kebab-case", () => {
      // Invariant: INV-CAT-SLUG-1
      expect(slugifyVietnamese("Rau ăn lá Đà Lạt")).toBe("rau-an-la-da-lat");
      expect(slugifyVietnamese("Đậu Hà Lan hữu cơ 100%")).toBe(
        "dau-ha-lan-huu-co-100",
      );
    });

    it("trims leading and trailing separators from punctuation", () => {
      expect(slugifyVietnamese("  -- Cà chua bi (250g) -- ")).toBe(
        "ca-chua-bi-250g",
      );
    });
  });

  describe("validateProductPrices", () => {
    it("accepts positive integer base price when sale price is null", () => {
      // Invariant: INV-PROD-PRICE-1
      expect(validateProductPrices(65000, null)).toBeNull();
    });

    it("accepts sale price strictly lower than base price", () => {
      // Invariant: INV-PROD-PRICE-1
      expect(validateProductPrices(65000, 55000)).toBeNull();
    });

    it("rejects sale price equal to or greater than base price", () => {
      // Invariant: INV-PROD-PRICE-1
      expect(validateProductPrices(65000, 65000)).not.toBeNull();
      expect(validateProductPrices(65000, 70000)).not.toBeNull();
    });

    it("rejects non-positive or non-integer prices", () => {
      // Invariant: INV-PROD-PRICE-1
      expect(validateProductPrices(0, null)).not.toBeNull();
      expect(validateProductPrices(-1000, null)).not.toBeNull();
      expect(validateProductPrices(50000.5, null)).not.toBeNull();
      expect(validateProductPrices(50000, 0)).not.toBeNull();
    });
  });

  describe("validateProductImages", () => {
    it("accepts up to five product image URLs", () => {
      // Invariant: INV-PROD-MEDIA-1
      const fiveImages = Array.from(
        { length: MAX_PRODUCT_IMAGES },
        (_, idx) => `https://res.cloudinary.com/demo/image/upload/p${idx}.jpg`,
      );
      expect(validateProductImages([])).toBeNull();
      expect(validateProductImages(fiveImages)).toBeNull();
    });

    it("rejects more than five product image URLs", () => {
      // Invariant: INV-PROD-MEDIA-1
      const sixImages = Array.from(
        { length: MAX_PRODUCT_IMAGES + 1 },
        (_, idx) => `https://res.cloudinary.com/demo/image/upload/p${idx}.jpg`,
      );
      expect(validateProductImages(sixImages)).not.toBeNull();
    });
  });

  describe("getCategoryDeleteLockState", () => {
    const root = makeCategory({
      id: "cat-root",
      name: "Rau ăn lá",
      slug: "rau-an-la",
    });
    const child = makeCategory({
      id: "cat-child",
      name: "Cải xanh",
      slug: "cai-xanh",
      parentId: "cat-root",
    });
    const emptyRoot = makeCategory({
      id: "cat-empty",
      name: "Gia vị",
      slug: "gia-vi",
    });

    it("locks deletion when subcategories exist", () => {
      // Invariant: INV-CAT-DELETE-1
      const state = getCategoryDeleteLockState(
        "cat-root",
        [root, child],
        new Map(),
      );
      expect(state.locked).toBe(true);
      expect(state.childCount).toBe(1);
      expect(state.productCount).toBe(0);
      expect(state.reason).not.toBeNull();
    });

    it("locks deletion when products reference the category", () => {
      // Invariant: INV-CAT-DELETE-1
      const state = getCategoryDeleteLockState(
        "cat-child",
        [root, child],
        new Map([["cat-child", 3]]),
      );
      expect(state.locked).toBe(true);
      expect(state.childCount).toBe(0);
      expect(state.productCount).toBe(3);
      expect(state.reason).not.toBeNull();
    });

    it("unlocks deletion when no subcategories or products exist", () => {
      // Invariant: INV-CAT-DELETE-1
      const state = getCategoryDeleteLockState(
        "cat-empty",
        [root, child, emptyRoot],
        new Map([["cat-child", 2]]),
      );
      expect(state.locked).toBe(false);
      expect(state.childCount).toBe(0);
      expect(state.productCount).toBe(0);
      expect(state.reason).toBeNull();
    });
  });

  describe("buildCategoryTree", () => {
    it("groups children under sorted root categories", () => {
      const catB = makeCategory({
        id: "b",
        name: "Củ quả",
        slug: "cu-qua",
        sortOrder: 2,
      });
      const catA = makeCategory({
        id: "a",
        name: "Rau ăn lá",
        slug: "rau-an-la",
        sortOrder: 1,
      });
      const child2 = makeCategory({
        id: "a2",
        name: "Xà lách",
        slug: "xa-lach",
        parentId: "a",
        sortOrder: 2,
      });
      const child1 = makeCategory({
        id: "a1",
        name: "Cải xanh",
        slug: "cai-xanh",
        parentId: "a",
        sortOrder: 1,
      });

      const tree = buildCategoryTree([catB, child2, catA, child1]);
      expect(tree.map((node) => node.category.id)).toEqual(["a", "b"]);
      expect(tree[0]?.children.map((c) => c.id)).toEqual(["a1", "a2"]);
      expect(tree[1]?.children).toEqual([]);
    });
  });
});
