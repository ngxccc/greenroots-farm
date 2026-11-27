import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BUSINESS_RULES } from "@greenroots/shared";
import { HomeViewContent } from "@/features/home/components/home-view";
import type { StorefrontSubscriptionPlan } from "@/types/subscription.types";
import {
  SubscriptionCatalogView,
  SubscriptionCheckoutView,
} from "./subscription-catalog-view";

const SAMPLE_PLANS: readonly StorefrontSubscriptionPlan[] = [
  {
    id: "0195a8f0-0001-7000-8000-000000000101",
    slug: "goi-co-ban-4-chuyen",
    name: "Gói Cơ Bản",
    description: "Phù hợp hộ 1–2 người ăn rau hàng tuần.",
    priceVnd: 520_000,
    totalDeliveries: 4,
    weightPerDeliveryKg: 3,
    basketDescription: "3 kg rau củ hữu cơ đa dạng theo mùa",
    isActive: true,
    unitPriceVnd: 130_000,
  },
  {
    id: "0195a8f0-0001-7000-8000-000000000102",
    slug: "goi-gia-dinh-8-chuyen",
    name: "Gói Gia Đình",
    description: "Phù hợp gia đình 3–4 người.",
    priceVnd: 960_000,
    totalDeliveries: 8,
    weightPerDeliveryKg: 4,
    basketDescription: "4 kg rau củ & lá xanh theo mùa",
    isActive: true,
    unitPriceVnd: 120_000,
  },
];

describe("SubscriptionCatalogView", () => {
  describe("plan catalog rendering", () => {
    // Invariant: INV-SF04-2
    it("renders live plan fields and per-delivery unit price without fabricated discount claims", () => {
      const html = renderToStaticMarkup(
        createElement(SubscriptionCheckoutView, {
          plans: SAMPLE_PLANS,
          apiReachable: true,
        }),
      );

      expect(html).toContain("Gói Cơ Bản");
      expect(html).toContain("4 chuyến");
      expect(html).toContain("3 kg/chuyến");
      expect(html).toContain("3 kg rau củ hữu cơ đa dạng theo mùa");
      expect(html).toContain("130.000");
      expect(html).toContain("520.000");
      expect(html).toContain(
        `${BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM} km`,
      );
      expect(html).not.toContain("Tiết kiệm");
    });

    it("renders graceful empty and API-unavailable alerts when no plans are returned", () => {
      const emptyHtml = renderToStaticMarkup(
        createElement(SubscriptionCheckoutView, {
          plans: [],
          apiReachable: true,
        }),
      );
      const offlineHtml = renderToStaticMarkup(
        createElement(SubscriptionCheckoutView, {
          plans: [],
          apiReachable: false,
        }),
      );

      expect(emptyHtml).toContain('role="alert"');
      expect(emptyHtml).toContain("Hiện chưa có gói rau định kỳ đang mở bán");
      expect(offlineHtml).toContain('role="alert"');
      expect(offlineHtml).toContain("Không thể kết nối tới hệ thống cửa hàng");
    });

    it("renders auth skeleton and disabled submit button during pre-hydration SSR", () => {
      const html = renderToStaticMarkup(
        createElement(SubscriptionCheckoutView, {
          plans: SAMPLE_PLANS,
          apiReachable: true,
        }),
      );

      expect(html).toContain('aria-label="Đang kiểm tra trạng thái đăng nhập"');
      expect(html).toContain('data-testid="subscription-checkout-submit"');
      expect(html).toContain('disabled=""');
    });

    it("exports SubscriptionCatalogView as the page entrypoint", () => {
      expect(typeof SubscriptionCatalogView).toBe("function");
    });
  });
});

describe("HomeViewContent subscription plans section", () => {
  // Invariant: INV-SF04-2
  it("renders live subscription plans on home view using real DTO fields", () => {
    const html = renderToStaticMarkup(
      createElement(HomeViewContent, {
        shelves: [],
        plans: SAMPLE_PLANS,
        apiReachable: true,
      }),
    );

    expect(html).toContain('id="plans"');
    expect(html).toContain("Gói Cơ Bản");
    expect(html).toContain("3 kg rau củ hữu cơ đa dạng theo mùa");
    expect(html).toContain("130.000");
    expect(html).not.toContain("Tiết kiệm");
  });
});
