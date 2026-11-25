import { beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mapProductDtoToStorefront } from "@/features/catalog/services/catalog-mapper";
import type { ProductDto } from "@/features/catalog/types/catalog.types";
import { useCartStore } from "@/stores/cart.store";
import { ProductDetailActions } from "./product-detail-actions";
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
    "Thu hoạch thủ công lúc 15h chiều tại nông trại GreenRoots Đà Lạt (Đơn Dương, Lâm Đồng), xe lạnh đêm về TP.HCM.",
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

const DOM_GLOBAL_KEYS = [
  "window",
  "document",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "KeyboardEvent",
  "MouseEvent",
  "PointerEvent",
  "MutationObserver",
  "ResizeObserver",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
] as const;

async function withHappyDom(fn: (win: Window) => Promise<void>): Promise<void> {
  const win = new Window({ url: "http://localhost:3001/products/xa-lach" });
  const prev = new Map<string, PropertyDescriptor | undefined>();
  const target = globalThis as Record<string, unknown>;

  for (const key of DOM_GLOBAL_KEYS) {
    prev.set(key, Object.getOwnPropertyDescriptor(target, key));
    target[key] = (win as unknown as Record<string, unknown>)[key];
  }

  try {
    await fn(win);
  } finally {
    win.close();
    for (const key of DOM_GLOBAL_KEYS) {
      const descriptor = prev.get(key);
      if (descriptor) {
        Object.defineProperty(target, key, descriptor);
      } else {
        delete target[key];
      }
    }
  }
}

describe("ProductDetailHero", () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] });
  });

  describe("live stock and API-backed projection rendering", () => {
    it("renders single add-to-cart CTA initially without quantity stepper or unbacked batch tabs", () => {
      const html = renderToStaticMarkup(
        createElement(ProductDetailHero, {
          product: mapProductDtoToStorefront(MOCK_PRODUCT_DTO),
          dto: MOCK_PRODUCT_DTO,
        }),
      );

      expect(html).toContain("-50%");
      expect(html).toContain("VietGAP &amp; USDA Organic");
      expect(html).toContain("THÊM VÀO GIỎ HÀNG");
      expect(html).not.toContain('inputMode="decimal"');
      expect(html).not.toContain('inputmode="decimal"');
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

  describe("ProductDetailActions", () => {
    it("switches from single CTA to live cart stepper on add and reverts when decremented to zero", async () => {
      const product = mapProductDtoToStorefront(MOCK_PRODUCT_DTO);

      await withHappyDom(async (win) => {
        const { act } = await import("react");
        const { createRoot } = await import("react-dom/client");
        const container = win.document.createElement("div");
        win.document.body.appendChild(container);
        const root = createRoot(container as unknown as Element);

        await act(async () => {
          root.render(createElement(ProductDetailActions, { product }));
          await Promise.resolve();
        });

        const addButton = Array.from(
          win.document.querySelectorAll("button"),
        ).find((btn) =>
          btn.textContent.includes("THÊM VÀO GIỎ HÀNG"),
        ) as unknown as HTMLElement | undefined;
        expect(addButton).toBeDefined();
        expect(
          win.document.querySelector('input[inputmode="decimal"]'),
        ).toBeNull();

        await act(async () => {
          addButton?.click();
          await Promise.resolve();
        });

        expect(useCartStore.getState().items[0]?.quantity).toBe(1);
        const qtyInput = win.document.querySelector(
          'input[inputmode="decimal"]',
        ) as unknown as { value: string } | null;
        expect(qtyInput?.value).toBe("1");

        const plusButton = win.document.querySelector(
          `button[aria-label="Tăng số lượng ${product.name}"]`,
        ) as unknown as HTMLElement | null;
        const minusButton = win.document.querySelector(
          `button[aria-label="Giảm số lượng ${product.name}"]`,
        ) as unknown as HTMLElement | null;

        await act(async () => {
          plusButton?.click();
          await Promise.resolve();
        });
        expect(useCartStore.getState().items[0]?.quantity).toBe(2);

        await act(async () => {
          minusButton?.click();
          minusButton?.click();
          await Promise.resolve();
        });

        expect(useCartStore.getState().items).toHaveLength(0);
        expect(win.document.body.textContent).toContain("THÊM VÀO GIỎ HÀNG");

        await act(async () => {
          root.unmount();
          await Promise.resolve();
        });
      });
    });

    it("syncs stale cached cart stock with live availableQuantity on product detail mount", async () => {
      const staleCachedProduct = mapProductDtoToStorefront({
        ...MOCK_PRODUCT_DTO,
        availableQuantity: 2,
      });
      useCartStore.getState().addItem(staleCachedProduct, 2);
      expect(useCartStore.getState().items[0]?.availableQuantity).toBe(2);

      const restockedLiveProduct = mapProductDtoToStorefront({
        ...MOCK_PRODUCT_DTO,
        availableQuantity: 10,
      });

      await withHappyDom(async (win) => {
        const { act } = await import("react");
        const { createRoot } = await import("react-dom/client");
        const container = win.document.createElement("div");
        win.document.body.appendChild(container);
        const root = createRoot(container as unknown as Element);

        await act(async () => {
          root.render(
            createElement(ProductDetailActions, {
              product: restockedLiveProduct,
            }),
          );
          await Promise.resolve();
        });

        expect(useCartStore.getState().items[0]?.availableQuantity).toBe(10);

        const plusButton = win.document.querySelector(
          `button[aria-label="Tăng số lượng ${restockedLiveProduct.name}"]`,
        ) as unknown as HTMLElement | null;
        expect(plusButton).not.toBeNull();

        await act(async () => {
          plusButton?.click();
          await Promise.resolve();
        });

        expect(useCartStore.getState().items[0]?.quantity).toBe(3);

        await act(async () => {
          root.unmount();
          await Promise.resolve();
        });
      });
    });
  });
});
