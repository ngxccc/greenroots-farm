import { beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { useCartStore } from "@/stores/cart.store";
import { HeaderCartPopover } from "./header-cart-popover";

const DOM_GLOBAL_KEYS = [
  "window",
  "document",
  "HTMLElement",
  "Element",
  "Node",
] as const;

function withDomGlobals(fn: (win: Window) => void) {
  const win = new Window();
  const target = globalThis as Record<string, unknown>;
  const prev = new Map<string, PropertyDescriptor | undefined>();

  for (const key of DOM_GLOBAL_KEYS) {
    prev.set(key, Object.getOwnPropertyDescriptor(target, key));
    target[key] = (win as unknown as Record<string, unknown>)[key];
  }

  try {
    fn(win);
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

describe("HeaderCartPopover", () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] });
  });

  it("displays unique product item count in badge and accessible label when one SKU has multiple units", () => {
    useCartStore.setState({
      items: [
        {
          productId: "0195a8f0-0001-7000-8000-000000000001",
          slug: "xa-lach-romaine",
          name: "Xà lách Romaine",
          unitLabel: "300g",
          unitPriceVnd: 18_000,
          availableQuantity: 10,
          quantity: 5,
        },
      ],
    });

    withDomGlobals((win) => {
      const container = win.document.createElement("div");
      win.document.body.appendChild(container);
      const root = createRoot(container as unknown as HTMLElement);

      try {
        act(() => {
          root.render(createElement(HeaderCartPopover));
        });

        const badges = Array.from(
          container.querySelectorAll('[role="status"]'),
        );
        expect(badges.length).toBeGreaterThan(0);
        for (const badge of badges) {
          expect(badge.textContent).toBe("1");
        }

        const links = Array.from(
          container.querySelectorAll('[aria-label="Giỏ hàng (1 sản phẩm)"]'),
        );
        expect(links.length).toBeGreaterThan(0);
      } finally {
        act(() => {
          root.unmount();
        });
      }
    });
  });
});
