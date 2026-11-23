import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  mapProductDtoToStorefront,
  type ProductDto,
} from "@/services/storefront.service";
import { ProductDetailHero } from "./product-detail-hero";

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
  isUsda: true,
  isSubscriptionEligible: true,
  isActive: true,
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
};

describe("ProductDetailHero", () => {
  describe("live stock and API-backed projection rendering", () => {
    it("renders live catalog attributes and defaults picker to 1 without unbacked batch tabs", () => {
      const html = renderToStaticMarkup(
        createElement(ProductDetailHero, {
          product: mapProductDtoToStorefront(MOCK_PRODUCT_DTO),
          dto: MOCK_PRODUCT_DTO,
        }),
      );

      expect(html).toContain("-50%");
      expect(html).toContain("VietGAP &amp; USDA Organic");
      expect(html).toContain('value="1"');
      expect(html).toContain("focus-within:ring-2");
      expect(html).not.toContain("Mã lô truy xuất QR");
      expect(html).not.toContain("Nhật ký canh tác");
      expect(html).not.toContain("Đã xuất 75%");
      expect(html).not.toContain("FEFO");
    });

    it("renders placeholder slot when imageUrls is empty", () => {
      const noImageDto: ProductDto = {
        ...MOCK_PRODUCT_DTO,
        imageUrls: [],
      };
      const html = renderToStaticMarkup(
        createElement(ProductDetailHero, {
          product: mapProductDtoToStorefront(noImageDto),
          dto: noImageDto,
        }),
      );

      expect(html).toContain("<svg");
      expect(html).not.toContain("<img");
    });

    it("defaults quantity picker to remaining fractional stock when below one unit", () => {
      const fractionalDto: ProductDto = {
        ...MOCK_PRODUCT_DTO,
        availableQuantity: 0.5,
      };
      const html = renderToStaticMarkup(
        createElement(ProductDetailHero, {
          product: mapProductDtoToStorefront(fractionalDto),
          dto: fractionalDto,
        }),
      );

      expect(html).toContain('value="0.5"');
    });

    it("renders accessible out-of-stock alert when availableQuantity is zero", () => {
      const emptyDto: ProductDto = {
        ...MOCK_PRODUCT_DTO,
        availableQuantity: 0,
      };
      const html = renderToStaticMarkup(
        createElement(ProductDetailHero, {
          product: mapProductDtoToStorefront(emptyDto),
          dto: emptyDto,
        }),
      );

      expect(html).toContain('role="alert"');
      expect(html).not.toContain("THÊM VÀO GIỎ HÀNG");
    });
  });
});
