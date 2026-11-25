import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Window } from "happy-dom";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { useCartStore } from "@/stores/cart.store";
import { HeaderCartPopover } from "./header-cart-popover";

function ensureDomEnvironment(): HTMLElement {
  if (typeof globalThis.document === "undefined") {
    const win = new Window();
    Object.assign(globalThis, {
      window: win,
      document: win.document,
      HTMLElement: win.HTMLElement,
      Element: win.Element,
      Node: win.Node,
    });
  }
  const container = globalThis.document.createElement("div");
  globalThis.document.body.appendChild(container);
  return container;
}

describe("HeaderCartPopover", () => {
  let container: HTMLElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = ensureDomEnvironment();
    useCartStore.setState({ items: [] });
  });

  afterEach(() => {
    if (root) {
      flushSync(() => {
        root?.unmount();
      });
      root = null;
    }
    container.remove();
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

    root = createRoot(container);
    flushSync(() => {
      root?.render(createElement(HeaderCartPopover));
    });

    const badges = Array.from(container.querySelectorAll('[role="status"]'));
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(badge.textContent).toBe("1");
    }

    const links = Array.from(
      container.querySelectorAll('[aria-label="Giỏ hàng (1 sản phẩm)"]'),
    );
    expect(links.length).toBeGreaterThan(0);
  });
});
