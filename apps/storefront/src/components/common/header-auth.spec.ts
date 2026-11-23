import { describe, expect, it, mock } from "bun:test";
import { createRequire } from "node:module";
import path from "node:path";
import { Window } from "happy-dom";
import { createElement, useLayoutEffect } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StorefrontSessionUser } from "@/types/auth.types";
import { BrandLogo } from "./brand-logo";
import { HeaderAuthView } from "./header-auth-controls";
import { HeaderAuthSkeleton } from "./header-auth-slot";

// Base UI binds `useIsoLayoutEffect` to a no-op at module evaluation when SSR specs load
// `@greenroots/ui` first; override the resolved CJS/ESM targets so Portal layout effects run in DOM tests.
const uiRequire = createRequire(import.meta.url);
const baseUiReactDir = path.dirname(
  uiRequire.resolve("@base-ui/react", {
    paths: [path.resolve(import.meta.dir, "../../../../../packages/ui")],
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
  "IS_REACT_ACT_ENVIRONMENT",
] as const;

async function withHappyDom(
  run: (win: Window) => Promise<void>,
): Promise<void> {
  const win = new Window({ url: "http://localhost:3001/" });
  const target = globalThis as unknown as Record<string, unknown>;
  const previous = new Map<string, { existed: boolean; value: unknown }>();

  for (const key of DOM_GLOBAL_KEYS) {
    previous.set(key, { existed: key in target, value: target[key] });
  }

  target.window = win;
  target.document = win.document;
  target.HTMLElement = win.HTMLElement;
  target.Element = win.Element;
  target.Node = win.Node;
  target.Event = win.Event;
  target.KeyboardEvent = win.KeyboardEvent;
  target.MouseEvent = win.MouseEvent;
  target.PointerEvent = win.PointerEvent;
  target.MutationObserver = win.MutationObserver;
  target.ResizeObserver = win.ResizeObserver;
  target.getComputedStyle = win.getComputedStyle.bind(win);
  target.requestAnimationFrame = win.requestAnimationFrame.bind(win);
  target.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
  target.IS_REACT_ACT_ENVIRONMENT = true;

  try {
    await run(win);
  } finally {
    await win.happyDOM.close();
    for (const [key, entry] of previous) {
      if (entry.existed) {
        target[key] = entry.value;
      } else {
        delete target[key];
      }
    }
  }
}

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

    it("renders customer name on SSR trigger and portal menu links in DOM when authenticated", async () => {
      // Invariant: INV-SF-AUTH-8
      const ssrHtml = renderToStaticMarkup(
        createElement(HeaderAuthView, { activeUser: sampleUser }),
      );
      expect(ssrHtml).toContain("Nguyễn Văn An");
      expect(ssrHtml).toContain('aria-haspopup="menu"');

      const openChangeCalls: boolean[] = [];
      let logoutCalls = 0;

      await withHappyDom(async (win) => {
        const { act } = await import("react");
        const { createRoot } = await import("react-dom/client");
        const container = win.document.createElement("div");
        win.document.body.appendChild(container);
        const root = createRoot(container as unknown as Element);

        await act(async () => {
          root.render(
            createElement(HeaderAuthView, {
              activeUser: sampleUser,
              menuOpen: true,
              onMenuOpenChange: (open: boolean) => openChangeCalls.push(open),
              onLogout: () => {
                logoutCalls++;
              },
            }),
          );
          await Promise.resolve();
        });

        const bodyHtml = win.document.body.innerHTML;
        expect(bodyHtml).toContain("khach@greenroots.vn");
        expect(bodyHtml).toContain('href="/account/profile"');
        expect(bodyHtml).toContain('href="/orders"');
        expect(bodyHtml).toContain("Đăng xuất");

        const menu = win.document.querySelector('[role="menu"]');
        expect(menu).not.toBeNull();

        const items = win.document.querySelectorAll('[role="menuitem"]');
        expect(items.length).toBe(3);

        const logoutItem = win.document.querySelector(
          '[role="menuitem"][data-variant="destructive"]',
        ) as unknown as HTMLElement | null;
        expect(logoutItem).not.toBeNull();
        await act(async () => {
          logoutItem?.click();
          await Promise.resolve();
        });
        expect(logoutCalls).toBe(1);

        await act(async () => {
          win.document.dispatchEvent(
            new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
          );
          await Promise.resolve();
        });
        expect(openChangeCalls).toContain(false);

        const outsideCountBefore = openChangeCalls.length;
        await act(async () => {
          win.document.body.dispatchEvent(
            new win.PointerEvent("pointerdown", { bubbles: true }),
          );
          await Promise.resolve();
        });
        expect(openChangeCalls.slice(outsideCountBefore)).toContain(false);

        await act(async () => {
          root.unmount();
          await Promise.resolve();
        });
      });
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
