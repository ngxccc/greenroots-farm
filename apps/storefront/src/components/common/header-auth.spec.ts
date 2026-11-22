import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StorefrontSessionUser } from "@/types/auth.types";
import { BrandLogo } from "./brand-logo";
import { HeaderAuthView } from "./header-auth-controls";
import { HeaderAuthSkeleton } from "./header-auth-slot";

const sampleUser: StorefrontSessionUser = {
  id: "0195a8f0-0001-7000-8000-000000000099",
  email: "khach@greenroots.vn",
  fullName: "Nguyễn Văn An",
  phone: "0901234567",
  role: "customer",
  status: "active",
  rewardPoints: 12500,
  emailVerified: true,
  createdAt: "2026-11-20T00:00:00.000Z",
  updatedAt: "2026-11-20T00:00:00.000Z",
};

describe("Storefront Header Auth UI", () => {
  describe("HeaderAuthView", () => {
    it("renders login and register links when user is unauthenticated", () => {
      // Invariant: INV-SF-AUTH-8
      const html = renderToStaticMarkup(
        createElement(HeaderAuthView, { activeUser: null }),
      );

      expect(html).toContain('href="/login"');
      expect(html).toContain("Đăng nhập");
      expect(html).toContain('href="/register"');
      expect(html).toContain("Đăng ký");
    });

    it("renders customer name and account menu actions when authenticated", () => {
      // Invariant: INV-SF-AUTH-8
      const html = renderToStaticMarkup(
        createElement(HeaderAuthView, {
          activeUser: sampleUser,
          menuOpen: true,
        }),
      );

      expect(html).toContain("Nguyễn Văn An");
      expect(html).toContain("khach@greenroots.vn");
      expect(html).toContain('href="/account/profile"');
      expect(html).toContain('href="/orders"');
      expect(html).toContain("Đăng xuất");
    });
  });

  describe("HeaderAuthSkeleton and BrandLogo", () => {
    it("renders static suspense fallback and GreenRoots Farm wordmark cleanly", () => {
      // Invariant: INV-SF-AUTH-8
      const skeletonHtml = renderToStaticMarkup(
        createElement(HeaderAuthSkeleton),
      );
      const logoHtml = renderToStaticMarkup(
        createElement(BrandLogo, { variant: "on-dark", size: "md" }),
      );

      expect(skeletonHtml).toContain("animate-pulse");
      expect(logoHtml).toContain("GreenRoots");
      expect(logoHtml).toContain("Farm");
    });
  });
});
