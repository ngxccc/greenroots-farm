import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeViewContent } from "@/features/home/components/home-view";
import { ProductCard } from "@/features/home/components/product-card";
import {
  HOME_MAX_SHELVES,
  HOME_SHELF_PRODUCTS_LIMIT,
  deriveCategoryKey,
  fetchLiveHomeCatalog,
  mapProductDtoToStorefront,
  type CategoryDto,
  type HomeCatalogDeps,
  type ProductDto,
} from "./storefront.service";

const ROOT_LEAF_CATEGORY: CategoryDto = {
  id: "cat-root-leaf",
  name: "Rau ăn lá",
  slug: "rau-an-la",
  description: "Các loại rau ăn lá theo mùa",
  parentId: null,
  sortOrder: 1,
  isActive: true,
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
};

const ROOT_FRUIT_CATEGORY: CategoryDto = {
  id: "cat-root-fruit",
  name: "Rau củ quả",
  slug: "rau-cu-qua",
  description: "Rau củ và trái cây",
  parentId: null,
  sortOrder: 2,
  isActive: true,
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
};

const ROOT_CUSTOM_CATEGORY: CategoryDto = {
  id: "cat-root-beans",
  name: "Đậu & Hạt",
  slug: "dau-va-hat",
  description: "Đậu và hạt hữu cơ",
  parentId: null,
  sortOrder: 3,
  isActive: true,
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
};

const MOCK_LEAF_PRODUCT_DTO: ProductDto = {
  id: "prod-live-001",
  categoryId: ROOT_LEAF_CATEGORY.id,
  category: {
    id: ROOT_LEAF_CATEGORY.id,
    name: ROOT_LEAF_CATEGORY.name,
    slug: ROOT_LEAF_CATEGORY.slug,
    parentId: null,
  },
  name: "Cải ngọt baby sống",
  slug: "cai-ngot-baby-song",
  description: "Thu hoạch tươi từ Củ Chi.",
  basePriceVnd: 30000,
  salePriceVnd: null,
  availableQuantity: 20,
  unit: "bó",
  imageUrls: ["https://res.cloudinary.com/demo/image/upload/cai-ngot.jpg"],
  isVietGap: true,
  isUsda: false,
  isSubscriptionEligible: true,
  isActive: true,
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
};

const MOCK_CHILD_TOMATO_DTO: ProductDto = {
  ...MOCK_LEAF_PRODUCT_DTO,
  id: "prod-live-002",
  categoryId: "cat-child-tomato",
  category: {
    id: "cat-child-tomato",
    name: "Cà chua",
    slug: "ca-chua",
    parentId: ROOT_FRUIT_CATEGORY.id,
  },
  name: "Cà chua bi hữu cơ",
  slug: "ca-chua-bi-huu-co",
  basePriceVnd: 45000,
  availableQuantity: 0,
  unit: "kg",
};

const MOCK_INACTIVE_DTO: ProductDto = {
  ...MOCK_LEAF_PRODUCT_DTO,
  id: "prod-live-003",
  isActive: false,
};

function createSeedProducts(count: number, categoryId: string): ProductDto[] {
  return Array.from({ length: count }, (_, index) => ({
    ...MOCK_LEAF_PRODUCT_DTO,
    id: `prod-${categoryId}-${index + 1}`,
    slug: `san-pham-${index + 1}`,
    name: `Sản phẩm ${index + 1}`,
    categoryId,
  }));
}

describe("Storefront Home Catalog", () => {
  describe("deriveCategoryKey", () => {
    it("derives leaf, fruit, and spice keys including mushrooms and parent fallback", () => {
      expect(deriveCategoryKey("rau-an-la")).toBe("leaf");
      expect(deriveCategoryKey("green-leaves")).toBe("leaf");
      expect(deriveCategoryKey("cu-qua")).toBe("fruit");
      expect(deriveCategoryKey("rau-cu-qua")).toBe("fruit");
      expect(deriveCategoryKey("trai-cay-sach")).toBe("fruit");
      expect(deriveCategoryKey("organic-fruits")).toBe("fruit");
      expect(deriveCategoryKey("rau-gia-vi")).toBe("spice");
      expect(deriveCategoryKey("nam-cac-loai")).toBe("spice");
      expect(deriveCategoryKey("fresh-herbs")).toBe("spice");
      expect(deriveCategoryKey("ca-chua", "rau-cu-qua")).toBe("fruit");
      expect(deriveCategoryKey("specialty")).toBe("leaf");
    });
  });

  describe("mapProductDtoToStorefront", () => {
    it("maps core fields, unit labels, certifications, and suppresses duplicate root category badges", () => {
      const product = mapProductDtoToStorefront(MOCK_LEAF_PRODUCT_DTO);
      expect(product.id).toBe("prod-live-001");
      expect(product.slug).toBe("cai-ngot-baby-song");
      expect(product.unitLabel).toBe("1 bó");
      expect(product.basePriceVnd).toBe(30000);
      expect(product.salePriceVnd).toBeUndefined();
      expect(product.availableQuantity).toBe(20);
      expect(product.badgeText).toBe("VietGAP");
      expect(product.imageUrl).toBe(
        "https://res.cloudinary.com/demo/image/upload/cai-ngot.jpg",
      );
      expect(product.isRescueDeal).toBe(false);

      const usdaWithSale = mapProductDtoToStorefront({
        ...MOCK_LEAF_PRODUCT_DTO,
        unit: "500g",
        isVietGap: false,
        isUsda: true,
        salePriceVnd: 25000,
        imageUrls: [],
      });
      expect(usdaWithSale.unitLabel).toBe("500g");
      expect(usdaWithSale.badgeText).toBe("USDA Organic");
      expect(usdaWithSale.salePriceVnd).toBe(25000);
      expect(usdaWithSale.imageUrl).toBeUndefined();

      const sameRootNoBadge = mapProductDtoToStorefront(
        {
          ...MOCK_LEAF_PRODUCT_DTO,
          isVietGap: false,
          isUsda: false,
        },
        ROOT_LEAF_CATEGORY.id,
      );
      expect(sameRootNoBadge.badgeText).toBeUndefined();

      const childCategoryBadge = mapProductDtoToStorefront(
        {
          ...MOCK_CHILD_TOMATO_DTO,
          isVietGap: false,
          isUsda: false,
        },
        ROOT_FRUIT_CATEGORY.id,
      );
      expect(childCategoryBadge.unitLabel).toBe("1 kg");
      expect(childCategoryBadge.badgeText).toBe("Cà chua");
    });
  });

  describe("fetchLiveHomeCatalog", () => {
    it("builds dynamic shelves from root categories, omits empty shelves, and caps at 6x8", async () => {
      const eightExtraCategories: CategoryDto[] = Array.from(
        { length: 8 },
        (_, index) => ({
          ...ROOT_LEAF_CATEGORY,
          id: `cat-root-${index + 1}`,
          name: `Danh mục ${index + 1}`,
          slug: `danh-muc-${index + 1}`,
          sortOrder: index + 1,
        }),
      );

      let capturedRootLimit = 0;
      let capturedPerShelfLimit = 0;

      const deps: HomeCatalogDeps = {
        fetchCategories: (query) => {
          capturedRootLimit = query.limit;
          return Promise.resolve({
            data: { data: eightExtraCategories },
            error: undefined,
          });
        },
        fetchProductsByCategory: ({ categoryId, limit }) => {
          capturedPerShelfLimit = limit;
          if (categoryId === "cat-root-2") {
            return Promise.resolve({ data: { data: [] }, error: undefined });
          }
          if (categoryId === "cat-root-1") {
            return Promise.resolve({
              data: {
                data: [
                  ...createSeedProducts(10, categoryId),
                  MOCK_INACTIVE_DTO,
                ],
              },
              error: undefined,
            });
          }
          return Promise.resolve({
            data: { data: [MOCK_CHILD_TOMATO_DTO] },
            error: undefined,
          });
        },
      };

      const shelves = await fetchLiveHomeCatalog(undefined, deps);

      expect(HOME_MAX_SHELVES).toBe(6);
      expect(HOME_SHELF_PRODUCTS_LIMIT).toBe(8);
      expect(capturedRootLimit).toBe(6);
      expect(capturedPerShelfLimit).toBe(8);
      expect(shelves).toHaveLength(5);
      expect(shelves[0]?.id).toBe("cat-root-1");
      expect(shelves[0]?.products).toHaveLength(8);
      expect(shelves.some((shelf) => shelf.id === "cat-root-2")).toBe(false);
    });

    it("keeps healthy category shelves when a sibling category product fetch fails", async () => {
      const deps: HomeCatalogDeps = {
        fetchCategories: () =>
          Promise.resolve({
            data: {
              data: [
                ROOT_LEAF_CATEGORY,
                ROOT_FRUIT_CATEGORY,
                ROOT_CUSTOM_CATEGORY,
              ],
            },
            error: undefined,
          }),
        fetchProductsByCategory: ({ categoryId }) => {
          if (categoryId === ROOT_FRUIT_CATEGORY.id) {
            return Promise.reject(new Error("Transient failure"));
          }
          if (categoryId === ROOT_CUSTOM_CATEGORY.id) {
            return Promise.resolve({ data: undefined, error: { status: 500 } });
          }
          return Promise.resolve({
            data: { data: [MOCK_LEAF_PRODUCT_DTO] },
            error: undefined,
          });
        },
      };

      const shelves = await fetchLiveHomeCatalog(undefined, deps);
      expect(shelves).toHaveLength(1);
      expect(shelves[0]?.slug).toBe("rau-an-la");
      expect(shelves[0]?.name).toBe("Rau ăn lá");
    });

    it("returns empty array when root categories fail, error, or are empty", async () => {
      const emptyDeps: HomeCatalogDeps = {
        fetchCategories: () =>
          Promise.resolve({ data: { data: [] }, error: undefined }),
        fetchProductsByCategory: () =>
          Promise.resolve({ data: { data: [] }, error: undefined }),
      };
      const errorDeps: HomeCatalogDeps = {
        ...emptyDeps,
        fetchCategories: () =>
          Promise.resolve({ data: undefined, error: { status: 500 } }),
      };
      const throwDeps: HomeCatalogDeps = {
        ...emptyDeps,
        fetchCategories: () => Promise.reject(new Error("Network error")),
      };

      expect(await fetchLiveHomeCatalog(undefined, emptyDeps)).toHaveLength(0);
      expect(await fetchLiveHomeCatalog(undefined, errorDeps)).toHaveLength(0);
      expect(await fetchLiveHomeCatalog(undefined, throwDeps)).toHaveLength(0);
    });
  });

  describe("HomeView and ProductCard live rendering", () => {
    it("hides numeric stock label on standard cards and disables purchase action when stock is zero", () => {
      const inStockHtml = renderToStaticMarkup(
        createElement(ProductCard, {
          product: mapProductDtoToStorefront(MOCK_LEAF_PRODUCT_DTO),
        }),
      );
      const outOfStockHtml = renderToStaticMarkup(
        createElement(ProductCard, {
          product: mapProductDtoToStorefront(MOCK_CHILD_TOMATO_DTO),
        }),
      );

      expect(inStockHtml).not.toContain("Còn 20 bó");
      expect(inStockHtml).toContain("MUA NGAY");
      expect(outOfStockHtml).not.toContain("Còn 0 kg");
      expect(outOfStockHtml).toContain("Tạm hết hàng");
      expect(outOfStockHtml).toContain("disabled");
    });

    it("renders dynamic category shelves and quick-nav anchors while hiding empty states", () => {
      const customShelfHtml = renderToStaticMarkup(
        createElement(HomeViewContent, {
          shelves: [
            {
              id: ROOT_CUSTOM_CATEGORY.id,
              name: ROOT_CUSTOM_CATEGORY.name,
              slug: ROOT_CUSTOM_CATEGORY.slug,
              products: [mapProductDtoToStorefront(MOCK_LEAF_PRODUCT_DTO)],
            },
          ],
          apiReachable: true,
        }),
      );

      expect(customShelfHtml).toContain('id="shelf-dau-va-hat"');
      expect(customShelfHtml).toContain('href="#shelf-dau-va-hat"');
      expect(customShelfHtml).toContain("ĐẬU &amp; HẠT");
      expect(customShelfHtml).not.toContain('id="rescue"');
      expect(customShelfHtml).not.toContain('id="plans"');
      expect(customShelfHtml).not.toContain("RAU ĂN LÁ HỮU CƠ");
      expect(customShelfHtml).not.toContain("BATCH-2026-TOM-01");

      const emptyOfflineHtml = renderToStaticMarkup(
        createElement(HomeViewContent, {
          shelves: [],
          apiReachable: false,
        }),
      );

      expect(emptyOfflineHtml).toContain("Mất kết nối API");
      expect(emptyOfflineHtml).toContain(
        "Không thể kết nối tới hệ thống cửa hàng",
      );
      expect(emptyOfflineHtml).not.toContain("Chế độ Demo");
    });
  });
});
