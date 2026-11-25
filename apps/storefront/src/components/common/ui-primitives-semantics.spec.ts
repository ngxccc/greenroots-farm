import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Alert, AlertDescription } from "@greenroots/ui";
import { AuthAlertBanner } from "@/features/auth/components/auth-alert-banner";
import { ProductCard } from "@/features/home/components/product-card";
import { TraceLookupContent } from "@/features/traceability/components/trace-lookup-view";
import type { StorefrontProduct } from "@/features/catalog/types/catalog.types";
import { StorefrontHeaderSearchForm } from "./header";
import { NotFoundSearchFormView } from "./not-found-search-form";

function buildRescueProduct(rescueBatchProgressPct: number): StorefrontProduct {
  return {
    id: "prod-rescue-01",
    slug: "ca-chua-bi-giai-cuu",
    name: "Cà chua bi hữu cơ",
    unit: "hộp",
    unitLabel: "Hộp 500g",
    basePriceVnd: 45_000,
    salePriceVnd: 29_000,
    availableQuantity: 12,
    badgeText: "Giải cứu -35%",
    hoursRemaining: 6,
    isRescueDeal: true,
    rescueBatchProgressPct,
    isSubscriptionEligible: false,
  };
}

describe("Storefront UI Primitives Semantics", () => {
  describe("AuthAlertBanner", () => {
    it("renders accessible alert and status roles for error and success variants", () => {
      const errorHtml = renderToStaticMarkup(
        createElement(AuthAlertBanner, {
          variant: "error",
          message: "Liên kết không hợp lệ",
        }),
      );
      const successHtml = renderToStaticMarkup(
        createElement(AuthAlertBanner, {
          variant: "success",
          message: "Đã đặt lại mật khẩu",
        }),
      );
      const directSuccessHtml = renderToStaticMarkup(
        createElement(
          Alert,
          { variant: "success" },
          createElement(AlertDescription, null, "Thành công"),
        ),
      );

      expect(errorHtml).toContain('role="alert"');
      expect(errorHtml).toContain("Liên kết không hợp lệ");
      expect(successHtml).toContain('role="status"');
      expect(successHtml).toContain("Đã đặt lại mật khẩu");
      expect(directSuccessHtml).toContain('role="status"');
    });
  });

  describe("ProductCard", () => {
    it("renders semantic progressbar with clamped rescue percentage", () => {
      const overMaxHtml = renderToStaticMarkup(
        createElement(ProductCard, { product: buildRescueProduct(140) }),
      );
      const underMinHtml = renderToStaticMarkup(
        createElement(ProductCard, { product: buildRescueProduct(-15) }),
      );

      expect(overMaxHtml).toContain('role="progressbar"');
      expect(overMaxHtml).toContain('aria-valuenow="100"');
      expect(overMaxHtml).toContain(
        'aria-label="Tiến độ giải cứu Cà chua bi hữu cơ"',
      );
      expect(underMinHtml).toContain('aria-valuenow="0"');
    });

    // Invariant: INV-5
    it("renders markdown discount percentage and live stock label when showStock is enabled", () => {
      const standardHtml = renderToStaticMarkup(
        createElement(ProductCard, {
          product: {
            ...buildRescueProduct(0),
            isRescueDeal: false,
            rescueBatchProgressPct: undefined,
            hoursRemaining: undefined,
            basePriceVnd: 40_000,
            salePriceVnd: 30_000,
            availableQuantity: 8,
            unit: "túi",
          },
          showStock: true,
        }),
      );

      expect(standardHtml).toContain("-25%");
      expect(standardHtml).toContain("Còn 8 túi");
      expect(standardHtml).toContain("MUA NGAY");

      const outOfStockHtml = renderToStaticMarkup(
        createElement(ProductCard, {
          product: {
            ...buildRescueProduct(0),
            isRescueDeal: false,
            rescueBatchProgressPct: undefined,
            hoursRemaining: undefined,
            availableQuantity: 0,
            unit: "túi",
          },
          showStock: true,
        }),
      );

      expect(outOfStockHtml).toContain("Tạm hết hàng");
      expect(outOfStockHtml).toContain("disabled");
    });
  });

  describe("Search InputGroup forms", () => {
    it("binds external labels outside InputGroup across header, not-found, and trace search bars", () => {
      for (const element of [
        createElement(StorefrontHeaderSearchForm, { query: "cải bó xôi" }),
        createElement(NotFoundSearchFormView, { query: "xà lách" }),
        createElement(TraceLookupContent, {
          records: [],
          batchCode: "BATCH-2026-TOM-01",
          previewCode: "",
        }),
      ]) {
        const html = renderToStaticMarkup(element);
        const labelForMatch = /<label[^>]*for="([^"]+)"/.exec(html);
        const inputGroupMatch = html.includes('data-slot="input-group"');

        expect(labelForMatch).not.toBeNull();
        expect(inputGroupMatch).toBe(true);
        const id = labelForMatch?.[1] ?? "";
        expect(html).toContain(`id="${id}"`);
        expect(html.indexOf(`for="${id}"`)).toBeLessThan(
          html.indexOf('data-slot="input-group"'),
        );
      }
    });
  });
});
