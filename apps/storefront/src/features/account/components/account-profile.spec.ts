import { describe, expect, it, mock } from "bun:test";
import { createRequire } from "node:module";
import path from "node:path";
import { Window } from "happy-dom";
import { createElement, useLayoutEffect } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StorefrontSessionUser } from "@/types/auth.types";
import { AccountProfileDegradedCard } from "./account-profile-view";
import { AccountSidebarView } from "./account-sidebar";
import { LoyaltyBalanceCard } from "./loyalty-balance-card";
import { ProfileDetailsFormView } from "./profile-details-form";
import { SecuritySessionsView } from "./security-sessions-card";

const uiRequire = createRequire(import.meta.url);
const baseUiReactDir = path.dirname(
  uiRequire.resolve("@base-ui/react", {
    paths: [path.resolve(import.meta.dir, "../../../../../../packages/ui")],
  }),
);
const baseUiIsoLayoutCjsPath = uiRequire.resolve(
  "@base-ui/utils/useIsoLayoutEffect",
  { paths: [baseUiReactDir] },
);
const baseUiIsoLayoutEsmPath = baseUiIsoLayoutCjsPath.replace(/\.js$/, ".mjs");

void mock.module(baseUiIsoLayoutEsmPath, () => ({
  useIsoLayoutEffect: useLayoutEffect,
}));
void mock.module(baseUiIsoLayoutCjsPath, () => ({
  useIsoLayoutEffect: useLayoutEffect,
}));

const sampleUser: StorefrontSessionUser = {
  id: "0195a8f0-0001-7000-8000-000000000099",
  email: "minhanh@greenroots.vn",
  fullName: "Nguyễn Minh Anh",
  phone: "0908412679",
  role: "customer",
  status: "active",
  rewardPoints: 2450,
  emailVerified: true,
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
  const win = new Window({ url: "http://localhost:3001/account/profile" });
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

describe("Account Profile UI Components", () => {
  describe("LoyaltyBalanceCard", () => {
    it("renders loyalty points with one-to-one VND conversion cleanly", () => {
      // Invariant: INV-SF-PROFILE-4
      const html = renderToStaticMarkup(
        createElement(LoyaltyBalanceCard, { rewardPoints: 2450 }),
      );

      expect(html).toContain("2.450 điểm");
      expect(html).toContain("2.450đ");
      expect(html).toContain("1 điểm = 1đ");
    });
  });

  describe("AccountSidebarView", () => {
    it("renders implemented routes and triggers mobile sheet and logout dialog on click", async () => {
      // Invariant: INV-SF-PROFILE-7
      const html = renderToStaticMarkup(
        createElement(AccountSidebarView, { user: sampleUser }),
      );

      expect(html).toContain('href="/account/profile"');
      expect(html).toContain('href="/account/addresses"');
      expect(html).toContain('href="/subscriptions"');
      expect(html).not.toContain("/orders");
      expect(html).toContain("MA");
      expect(html).toContain("Nguyễn Minh Anh");

      const mobileOpenEvents: boolean[] = [];
      const logoutOpenEvents: boolean[] = [];

      await withHappyDom(async (win) => {
        const { act } = await import("react");
        const { createRoot } = await import("react-dom/client");
        const container = win.document.createElement("div");
        win.document.body.appendChild(container);
        const root = createRoot(container as unknown as Element);

        await act(async () => {
          root.render(
            createElement(AccountSidebarView, {
              user: sampleUser,
              onMobileSheetOpenChange: (open: boolean) =>
                mobileOpenEvents.push(open),
              onLogoutDialogOpenChange: (open: boolean) =>
                logoutOpenEvents.push(open),
            }),
          );
          await Promise.resolve();
        });

        const mobileTrigger = win.document.querySelector(
          'button[aria-label="Mở danh mục tài khoản"]',
        ) as unknown as HTMLElement | null;
        expect(mobileTrigger).not.toBeNull();
        await act(async () => {
          mobileTrigger?.click();
          await Promise.resolve();
        });
        expect(mobileOpenEvents).toEqual([true]);

        const buttons = Array.from(
          win.document.querySelectorAll("button"),
        ) as unknown as HTMLElement[];
        const logoutBtn = buttons.find((btn) =>
          btn.textContent.includes("Đăng xuất"),
        );
        expect(logoutBtn).toBeDefined();
        await act(async () => {
          logoutBtn?.click();
          await Promise.resolve();
        });
        expect(logoutOpenEvents).toEqual([true]);

        await act(async () => {
          root.unmount();
          await Promise.resolve();
        });
      });
    });
  });

  describe("ProfileDetailsFormView", () => {
    it("renders sibling labels, optional phone input, read-only verified email, and dispatches submit", async () => {
      // Invariant: INV-SF-PROFILE-2
      const cleanHtml = renderToStaticMarkup(
        createElement(ProfileDetailsFormView, {
          email: sampleUser.email,
          emailVerified: true,
          createdAt: sampleUser.createdAt,
          fullName: sampleUser.fullName,
          phone: "",
          hasPendingChanges: false,
          isPending: false,
          errorMessage: null,
          onFullNameChange: () => undefined,
          onPhoneChange: () => undefined,
          onSubmit: () => undefined,
        }),
      );

      expect(cleanHtml).toContain('for="profile-full-name"');
      expect(cleanHtml).toContain('id="profile-full-name"');
      expect(cleanHtml).toContain('for="profile-phone"');
      expect(cleanHtml).toContain('id="profile-phone"');
      expect(cleanHtml).toContain("Đã xác thực");
      expect(cleanHtml).toContain("minhanh@greenroots.vn");
      expect(cleanHtml).toContain("disabled");
      expect(cleanHtml).not.toMatch(/name="phone"[^>]*required/);

      let submitCalls = 0;

      await withHappyDom(async (win) => {
        const { act } = await import("react");
        const { createRoot } = await import("react-dom/client");
        const container = win.document.createElement("div");
        win.document.body.appendChild(container);
        const root = createRoot(container as unknown as Element);

        await act(async () => {
          root.render(
            createElement(ProfileDetailsFormView, {
              email: sampleUser.email,
              emailVerified: false,
              createdAt: sampleUser.createdAt,
              fullName: sampleUser.fullName,
              phone: "0908412679",
              hasPendingChanges: true,
              isPending: false,
              errorMessage: "Số điện thoại không hợp lệ",
              onFullNameChange: () => undefined,
              onPhoneChange: () => undefined,
              onSubmit: (event) => {
                event.preventDefault();
                submitCalls++;
              },
            }),
          );
          await Promise.resolve();
        });

        expect(win.document.body.innerHTML).toContain('role="alert"');
        expect(win.document.body.innerHTML).toContain("Chưa xác thực");

        const savedHtml = renderToStaticMarkup(
          createElement(ProfileDetailsFormView, {
            email: sampleUser.email,
            emailVerified: true,
            createdAt: sampleUser.createdAt,
            fullName: sampleUser.fullName,
            phone: "0908412679",
            hasPendingChanges: false,
            isPending: false,
            errorMessage: null,
            successMessage: "Đã cập nhật thông tin hồ sơ cá nhân.",
            onFullNameChange: () => undefined,
            onPhoneChange: () => undefined,
            onSubmit: () => undefined,
          }),
        );
        expect(savedHtml).toContain('role="status"');
        expect(savedHtml).toContain("Đã cập nhật thông tin hồ sơ cá nhân.");

        const submitBtn = win.document.querySelector(
          'button[type="submit"]',
        ) as unknown as HTMLElement | null;
        expect(submitBtn).not.toBeNull();
        await act(async () => {
          submitBtn?.click();
          await Promise.resolve();
        });
        expect(submitCalls).toBe(1);

        await act(async () => {
          root.unmount();
          await Promise.resolve();
        });
      });
    });
  });

  describe("SecuritySessionsView", () => {
    it("opens confirmation dialog with revocation warning and inline error banner", async () => {
      // Invariant: INV-SF-PROFILE-6
      // Invariant: INV-SF-PROFILE-7
      const openEvents: boolean[] = [];
      let confirmCalls = 0;

      await withHappyDom(async (win) => {
        const { act } = await import("react");
        const { createRoot } = await import("react-dom/client");
        const container = win.document.createElement("div");
        win.document.body.appendChild(container);
        const root = createRoot(container as unknown as Element);

        await act(async () => {
          root.render(
            createElement(SecuritySessionsView, {
              dialogOpen: true,
              isPending: false,
              errorMessage: "Quá nhiều yêu cầu",
              onDialogOpenChange: (open: boolean) => openEvents.push(open),
              onConfirmLogoutAll: () => {
                confirmCalls++;
              },
            }),
          );
          await Promise.resolve();
        });

        const bodyHtml = win.document.body.innerHTML;
        expect(bodyHtml).toContain("Đăng xuất khỏi tất cả thiết bị");
        expect(bodyHtml).toContain("bao gồm cả thiết bị hiện tại");
        expect(bodyHtml).toContain("Xác nhận đăng xuất khỏi tất cả thiết bị?");
        expect(bodyHtml).toContain('role="alert"');
        expect(bodyHtml).toContain("Quá nhiều yêu cầu");

        const buttons = Array.from(
          win.document.querySelectorAll("button"),
        ) as unknown as HTMLElement[];
        const triggerBtn = buttons.find((btn) =>
          btn.textContent.includes("Đăng xuất khỏi tất cả thiết bị"),
        );
        const confirmBtn = buttons.find((btn) =>
          btn.textContent.includes("Xác nhận đăng xuất tất cả"),
        );
        expect(triggerBtn).toBeDefined();
        expect(confirmBtn).toBeDefined();

        await act(async () => {
          triggerBtn?.click();
          confirmBtn?.click();
          await Promise.resolve();
        });

        expect(openEvents).toContain(true);
        expect(confirmCalls).toBe(1);

        await act(async () => {
          root.unmount();
          await Promise.resolve();
        });
      });
    });
  });

  describe("AccountProfileDegradedCard", () => {
    it("renders accessible alert banner with safe retry CTA and zero internal stacks", () => {
      // Invariant: INV-SF-PROFILE-1
      const html = renderToStaticMarkup(
        createElement(AccountProfileDegradedCard),
      );

      expect(html).toContain('role="alert"');
      expect(html).toContain("Thử tải lại");
      expect(html).toContain('href="/"');
      expect(html).not.toContain("ECONNREFUSED");
    });
  });
});
