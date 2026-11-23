import { describe, expect, it } from "bun:test";
import {
  filterApprovedProductImages,
  isApprovedStorefrontImageUrl,
} from "@/lib/image-url";
import {
  fetchLiveProductBySlug,
  type ProductDetailDeps,
  type ProductDto,
} from "@/services/storefront.service";
import {
  clampOrderQuantity,
  formatCertificationSummary,
  formatQuantityDisplay,
  getCatalogDiscountPercent,
  getDefaultOrderQuantity,
  parseOrderQuantityInput,
} from "./product-detail.utils";

const MOCK_PRODUCT_DTO: ProductDto = {
  id: "0195a8f0-0001-7000-8000-000000000001",
  categoryId: "cat-leaf",
  category: {
    id: "cat-leaf",
    name: "Rau ăn lá",
    slug: "rau-an-la",
    parentId: null,
  },
  name: "Xà lách Romaine hữu cơ",
  slug: "xa-lach-romaine",
  description:
    "Thu hoạch thủ công lúc 4h sáng tại nông trại GreenRoots Củ Chi.",
  basePriceVnd: 36000,
  salePriceVnd: 18000,
  availableQuantity: 12.5,
  unit: "kg",
  imageUrls: ["https://res.cloudinary.com/greenroots/image/upload/romaine.jpg"],
  isVietGap: true,
  isUsda: false,
  isSubscriptionEligible: true,
  isActive: true,
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
};

describe("ProductDetailUtils", () => {
  describe("quantity clamping and decimal parsing", () => {
    it("defaults to 1 when remaining stock is at least 1 and falls back to exact fractional stock when below 1", () => {
      expect(getDefaultOrderQuantity(12.5)).toBe(1);
      expect(getDefaultOrderQuantity(1)).toBe(1);
      expect(getDefaultOrderQuantity(0.5)).toBe(0.5);
      expect(getDefaultOrderQuantity(0.25)).toBe(0.25);
      expect(getDefaultOrderQuantity(0)).toBe(0);
    });

    it("clamps positive and stepped-down quantities strictly within minimum and remaining stock", () => {
      expect(clampOrderQuantity(0.5, 12.5)).toBe(0.5);
      expect(clampOrderQuantity(2, 0.5)).toBe(0.5);
      expect(clampOrderQuantity(-0.5, 12.5)).toBe(0.01);
      expect(clampOrderQuantity(-0.75, 0.5)).toBe(0.01);
      expect(clampOrderQuantity(0, 0.5)).toBe(0.01);
      expect(clampOrderQuantity(0.001, 2)).toBe(0.01);
      expect(clampOrderQuantity(1, 0)).toBe(0);
    });

    it("parses dot and comma decimal inputs with up to two fractional digits", () => {
      expect(parseOrderQuantityInput("0.5")).toBe(0.5);
      expect(parseOrderQuantityInput("1,25")).toBe(1.25);
      expect(parseOrderQuantityInput("2")).toBe(2);
      expect(parseOrderQuantityInput("0")).toBeNull();
      expect(parseOrderQuantityInput("-1")).toBeNull();
      expect(parseOrderQuantityInput("1.234")).toBeNull();
      expect(parseOrderQuantityInput("abc")).toBeNull();
      expect(formatQuantityDisplay(1.5)).toBe("1.5");
    });
  });

  describe("image URL allowlist and display formatting", () => {
    it("accepts only approved remote hosts or local root asset paths", () => {
      expect(
        isApprovedStorefrontImageUrl(
          "https://res.cloudinary.com/demo/image/upload/v1/products/romaine.jpg",
        ),
      ).toBe(true);
      expect(isApprovedStorefrontImageUrl("https://placehold.co/600x400")).toBe(
        true,
      );
      expect(
        isApprovedStorefrontImageUrl("/images/about/romaine-harvest.jpg"),
      ).toBe(true);
      expect(
        isApprovedStorefrontImageUrl("https://lh3.googleusercontent.com/test"),
      ).toBe(false);
      expect(isApprovedStorefrontImageUrl("//evil.example/img.jpg")).toBe(
        false,
      );
      expect(
        isApprovedStorefrontImageUrl(
          "http://res.cloudinary.com/demo/image/upload/a.jpg",
        ),
      ).toBe(false);

      expect(
        filterApprovedProductImages([
          "https://res.cloudinary.com/demo/a.jpg",
          "https://untrusted.example/b.jpg",
          "/images/c.jpg",
        ]),
      ).toEqual(["https://res.cloudinary.com/demo/a.jpg", "/images/c.jpg"]);
    });

    it("calculates catalog markdown percentage and combined certification labels", () => {
      expect(getCatalogDiscountPercent(36000, 18000)).toBe(50);
      expect(getCatalogDiscountPercent(36000, null)).toBeNull();
      expect(getCatalogDiscountPercent(36000, 36000)).toBeNull();

      expect(formatCertificationSummary(true, true)).toBe(
        "VietGAP & USDA Organic",
      );
      expect(formatCertificationSummary(true, false)).toBe("VietGAP");
      expect(formatCertificationSummary(false, true)).toBe("USDA Organic");
      expect(formatCertificationSummary(false, false)).toBe("Canh tác hữu cơ");
    });
  });

  describe("fetchLiveProductBySlug", () => {
    it("returns mapped product and dto for active catalog items", async () => {
      const deps: ProductDetailDeps = {
        fetchProductBySlug: () =>
          Promise.resolve({
            data: { data: MOCK_PRODUCT_DTO },
            response: { status: 200 },
          }),
      };

      const result = await fetchLiveProductBySlug("xa-lach-romaine", deps);
      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.product.slug).toBe("xa-lach-romaine");
        expect(result.product.unitLabel).toBe("1 kg");
        expect(result.dto.availableQuantity).toBe(12.5);
      }
    });

    it("returns missing status when catalog item is absent, slug is invalid, or SKU is inactive", async () => {
      const notFoundDeps: ProductDetailDeps = {
        fetchProductBySlug: () =>
          Promise.resolve({
            error: { status: 404 },
            response: { status: 404 },
          }),
      };
      const badSlugDeps: ProductDetailDeps = {
        fetchProductBySlug: () =>
          Promise.resolve({
            error: { status: 400 },
            response: { status: 400 },
          }),
      };
      const inactiveDeps: ProductDetailDeps = {
        fetchProductBySlug: () =>
          Promise.resolve({
            data: { data: { ...MOCK_PRODUCT_DTO, isActive: false } },
            response: { status: 200 },
          }),
      };

      expect(
        await fetchLiveProductBySlug("xa-lach-romaine", notFoundDeps),
      ).toEqual({
        status: "not_found",
      });
      expect(await fetchLiveProductBySlug("BAD_SLUG", badSlugDeps)).toEqual({
        status: "not_found",
      });
      expect(await fetchLiveProductBySlug("   ", notFoundDeps)).toEqual({
        status: "not_found",
      });
      expect(
        await fetchLiveProductBySlug("xa-lach-romaine", inactiveDeps),
      ).toEqual({
        status: "not_found",
      });
    });

    it("returns error status when catalog lookup fails on server error or network outage", async () => {
      const serverErrorDeps: ProductDetailDeps = {
        fetchProductBySlug: () =>
          Promise.resolve({
            error: { status: 503 },
            response: { status: 503 },
          }),
      };
      const offlineDeps: ProductDetailDeps = {
        fetchProductBySlug: () => Promise.reject(new Error("ECONNREFUSED")),
      };

      expect(
        await fetchLiveProductBySlug("xa-lach-romaine", serverErrorDeps),
      ).toEqual({
        status: "error",
      });
      expect(
        await fetchLiveProductBySlug("xa-lach-romaine", offlineDeps),
      ).toEqual({
        status: "error",
      });
    });
  });
});
