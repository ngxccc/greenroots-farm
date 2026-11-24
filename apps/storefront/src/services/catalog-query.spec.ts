import { describe, expect, it } from "bun:test";
import {
  buildCatalogApiQuery,
  buildCatalogHref,
  buildCategoryTree,
  CATALOG_MAX_SEARCH_LENGTH,
  CATALOG_PAGE_LIMIT,
  parseCatalogSearchParams,
} from "@/services/catalog-query";
import { fetchCatalogListing } from "@/services/catalog.service";
import type {
  CatalogListingDeps,
  CategoryDto,
  ProductDto,
} from "@/types/catalog.types";

function makeCategory(
  overrides: Partial<CategoryDto> & { id: string; name: string; slug: string },
): CategoryDto {
  return {
    description: null,
    parentId: null,
    sortOrder: 0,
    isActive: true,
    createdAt: "2026-11-20T00:00:00.000Z",
    updatedAt: "2026-11-20T00:00:00.000Z",
    ...overrides,
  };
}

function makeProduct(
  overrides: Partial<ProductDto> & { id: string; name: string; slug: string },
): ProductDto {
  return {
    categoryId: "01933e70-0000-7000-8000-000000000001",
    category: {
      id: "01933e70-0000-7000-8000-000000000001",
      name: "Rau ăn lá",
      slug: "rau-an-la",
      parentId: null,
    },
    description: null,
    basePriceVnd: 36_000,
    salePriceVnd: 18_000,
    availableQuantity: 12,
    unit: "túi 300g",
    imageUrls: [],
    isVietGap: true,
    isUsda: false,
    isSubscriptionEligible: false,
    isActive: true,
    createdAt: "2026-11-20T00:00:00.000Z",
    updatedAt: "2026-11-20T00:00:00.000Z",
    ...overrides,
  };
}

describe("CatalogQuery", () => {
  describe("parseCatalogSearchParams", () => {
    // Invariant: INV-1
    it("sanitizes untrusted query values and falls back to safe defaults", () => {
      const longQuery = `  ${"a".repeat(CATALOG_MAX_SEARCH_LENGTH + 25)}  `;
      const parsed = parseCatalogSearchParams({
        q: longQuery,
        category: "INVALID_SLUG!",
        vietgap: "yes",
        usda: "true",
        price: "hack",
        sort: "discount:desc",
        page: "0",
      });

      expect(parsed.q).toHaveLength(CATALOG_MAX_SEARCH_LENGTH);
      expect(parsed.category).toBeUndefined();
      expect(parsed.vietgap).toBe(false);
      expect(parsed.usda).toBe(true);
      expect(parsed.price).toBe("all");
      expect(parsed.sort).toBe("createdAt:desc");
      expect(parsed.page).toBe(1);
    });

    // Invariant: INV-1
    it("accepts valid kebab-case slugs, whitelisted sort keys, and positive integer pages", () => {
      const parsed = parseCatalogSearchParams({
        q: "  xà lách  ",
        category: "rau-an-la",
        vietgap: "true",
        price: "25-40",
        sort: "price:asc",
        page: "3",
      });

      expect(parsed).toEqual({
        q: "xà lách",
        category: "rau-an-la",
        vietgap: true,
        usda: false,
        price: "25-40",
        sort: "price:asc",
        page: 3,
      });
    });
  });

  describe("buildCatalogApiQuery", () => {
    // Invariant: INV-2
    it("maps categorySlug exclusively without categoryId and preserves ordered price bounds", () => {
      const baseFilters = parseCatalogSearchParams({
        category: "ca-chua-bi",
        vietgap: "true",
        price: "25-40",
        sort: "price:desc",
        page: "2",
      });

      const query = buildCatalogApiQuery(baseFilters);
      expect(query).toEqual({
        categorySlug: "ca-chua-bi",
        isVietGap: true,
        minPriceVnd: 25_000,
        maxPriceVnd: 40_000,
        page: 2,
        limit: CATALOG_PAGE_LIMIT,
        sort: "price:desc",
      });
      expect("categoryId" in query).toBe(false);
      expect(query.minPriceVnd).toBeLessThanOrEqual(query.maxPriceVnd ?? 0);
    });
  });

  describe("buildCatalogHref", () => {
    // Invariant: INV-4
    it("resets page to 1 when non-page filters change and preserves filters on page changes", () => {
      const current = parseCatalogSearchParams({
        q: "cải",
        category: "rau-an-la",
        vietgap: "true",
        page: "4",
      });

      const changedFilterHref = buildCatalogHref(current, {
        sort: "price:asc",
      });
      expect(changedFilterHref).toBe(
        "/products?q=c%E1%BA%A3i&category=rau-an-la&vietgap=true&sort=price%3Aasc",
      );

      const changedPageHref = buildCatalogHref(current, { page: 2 });
      expect(changedPageHref).toBe(
        "/products?q=c%E1%BA%A3i&category=rau-an-la&vietgap=true&page=2",
      );
    });
  });

  describe("buildCategoryTree", () => {
    // Invariant: INV-3
    it("groups active categories into a two-level tree ordered by sortOrder", () => {
      const tree = buildCategoryTree([
        makeCategory({
          id: "root-2",
          name: "Củ & Quả",
          slug: "cu-qua",
          sortOrder: 2,
        }),
        makeCategory({
          id: "root-1",
          name: "Rau ăn lá",
          slug: "rau-an-la",
          sortOrder: 1,
        }),
        makeCategory({
          id: "child-1",
          name: "Cải hữu cơ",
          slug: "cai-huu-co",
          parentId: "root-1",
          sortOrder: 2,
        }),
        makeCategory({
          id: "child-2",
          name: "Xà lách",
          slug: "xa-lach",
          parentId: "root-1",
          sortOrder: 1,
        }),
        makeCategory({
          id: "inactive-root",
          name: "Ẩn",
          slug: "an",
          isActive: false,
          sortOrder: 0,
        }),
      ]);

      expect(tree.map((node) => node.slug)).toEqual(["rau-an-la", "cu-qua"]);
      expect(tree[0]?.children.map((node) => node.slug)).toEqual([
        "xa-lach",
        "cai-huu-co",
      ]);
      expect(tree[1]?.children).toEqual([]);
    });
  });

  describe("fetchCatalogListing", () => {
    it("degrades category sidebar when categories fail while keeping product listing", async () => {
      const deps: CatalogListingDeps = {
        fetchCategories: () => Promise.reject(new Error("Categories down")),
        fetchProducts: () =>
          Promise.resolve({
            data: {
              data: [
                makeProduct({
                  id: "prod-1",
                  name: "Xà lách Romaine",
                  slug: "xa-lach-romaine",
                }),
              ],
              meta: { page: 1, limit: 12, total: 1, totalPages: 1 },
            },
          }),
      };

      const result = await fetchCatalogListing(
        parseCatalogSearchParams({}),
        deps,
      );

      expect(result.errorMessage).toBeUndefined();
      expect(result.categories).toEqual([]);
      expect(result.products).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it("returns a localized error message when product listing fails", async () => {
      const deps: CatalogListingDeps = {
        fetchCategories: () => Promise.resolve({ data: { data: [] } }),
        fetchProducts: () =>
          Promise.resolve({ error: { code: "INTERNAL_ERROR" } }),
      };

      const result = await fetchCatalogListing(
        parseCatalogSearchParams({}),
        deps,
      );

      expect(result.products).toEqual([]);
      expect(typeof result.errorMessage).toBe("string");
      expect((result.errorMessage ?? "").length).toBeGreaterThan(0);
    });
  });
});
