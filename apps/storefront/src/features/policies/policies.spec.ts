import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BUSINESS_RULES } from "@greenroots/shared";
import { StorefrontFooter } from "@/components/common/footer";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";
import {
  PolicySidebar,
  PolicySidebarView,
} from "@/features/policies/components/policy-sidebar";
import { POLICY_NAV_ITEMS } from "@/features/policies/constants/policy-nav.constant";

describe("Storefront Policies & Information Pages", () => {
  describe("Policy Navigation Constants & Sidebar", () => {
    it("exposes canonical policy navigation routes", () => {
      // Invariant: INV-SF-POLICY-1
      const hrefs = POLICY_NAV_ITEMS.map((item) => item.href);
      expect(hrefs).toEqual([
        "/about",
        "/policies/shipping",
        "/policies/returns",
        "/policies/terms",
        "/policies/privacy",
      ]);
    });

    it("renders PolicySidebar with aria-current='page' on the active route", () => {
      // Invariant: INV-SF-POLICY-2
      const htmlAbout = renderToStaticMarkup(
        createElement(PolicySidebar, { currentPath: "/about" }),
      );
      expect(htmlAbout).toContain('aria-current="page"');
      expect(htmlAbout).toContain('href="/about"');
      expect(htmlAbout).toContain("Giới thiệu nông trại");
      expect(htmlAbout).toContain('href="/policies/shipping"');
      expect(htmlAbout).toContain('href="/policies/returns"');
      expect(htmlAbout).toContain('href="/policies/terms"');
      expect(htmlAbout).toContain('href="/policies/privacy"');

      const htmlShipping = renderToStaticMarkup(
        createElement(PolicySidebar, { currentPath: "/policies/shipping" }),
      );
      expect(htmlShipping).toContain('aria-current="page"');
      expect(htmlShipping).toContain("Chính sách giao hàng");

      const htmlReturns = renderToStaticMarkup(
        createElement(PolicySidebar, { currentPath: "/policies/returns" }),
      );
      expect(htmlReturns).toContain('aria-current="page"');
      expect(htmlReturns).toContain("Đổi trả độ tươi 2h");

      const htmlTerms = renderToStaticMarkup(
        createElement(PolicySidebar, { currentPath: "/policies/terms" }),
      );
      expect(htmlTerms).toContain('aria-current="page"');
      expect(htmlTerms).toContain("Điều khoản sử dụng");

      const htmlPrivacy = renderToStaticMarkup(
        createElement(PolicySidebar, { currentPath: "/policies/privacy" }),
      );
      expect(htmlPrivacy).toContain('aria-current="page"');
      expect(htmlPrivacy).toContain("Chính sách bảo mật");
    });

    it("renders PolicySidebarView with mobile drawer trigger button", () => {
      const html = renderToStaticMarkup(
        createElement(PolicySidebarView, { currentPath: "/about" }),
      );
      expect(html).toContain('aria-label="Mở danh mục chính sách"');
      expect(html).toContain("Thông tin &amp; Chính sách");
    });
  });

  describe("StorefrontFooter Links", () => {
    it("routes cleanly to all five policy and information pages", () => {
      // Invariant: INV-SF-POLICY-3
      const footerHtml = renderToStaticMarkup(createElement(StorefrontFooter));

      expect(footerHtml).toContain('href="/about"');
      expect(footerHtml).toContain('href="/policies/shipping"');
      expect(footerHtml).toContain('href="/policies/returns"');
      expect(footerHtml).toContain('href="/policies/terms"');
      expect(footerHtml).toContain('href="/policies/privacy"');
      expect(footerHtml).not.toContain('href="/shipping-policy"');
      expect(footerHtml).not.toContain('href="/freshness-policy"');
    });
  });

  describe("Policy Metadata & Domain Constants Alignment", () => {
    it("aligns FARM_METADATA with shared business rules and certification SSOT", () => {
      // Invariant: INV-SF-POLICY-4
      expect(FARM_METADATA.brandName).toBe("GreenRoots Farm");
      expect(FARM_METADATA.certificationCode).toBe("VG-HCM-2026-0089");
      expect(FARM_METADATA.complaintWindowHours).toBe(
        BUSINESS_RULES.COMPLAINT_WINDOW_HOURS,
      );
      expect(FARM_METADATA.maxDeliveryRadiusKm).toBe(
        BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM,
      );
      expect(BUSINESS_RULES.MIN_ORDER_VALUE_VND).toBe(50_000);
      expect(BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM).toBe(20);
      expect(BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM).toBe(25);
    });
  });
});
