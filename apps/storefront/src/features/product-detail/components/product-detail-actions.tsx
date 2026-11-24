"use client";

import {
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
} from "react";
import { AlertCircle, Minus, Plus, ShoppingCart } from "lucide-react";
import { Alert, AlertDescription, Button, Input, Label } from "@greenroots/ui";
import { roundQuantity } from "@/lib/format";
import { useCartStore } from "@/stores/cart.store";
import type { StorefrontProduct } from "@/types/catalog.types";
import {
  clampOrderQuantity,
  formatQuantityDisplay,
  getDefaultOrderQuantity,
  parseOrderQuantityInput,
} from "../utils/product-detail.utils";

interface ProductDetailActionsProps {
  readonly product: StorefrontProduct;
}

function subscribeCartHydration(onStoreChange: () => void): () => void {
  return useCartStore.persist.onFinishHydration(onStoreChange);
}

function getClientCartHydrated(): boolean {
  return useCartStore.persist.hasHydrated();
}

function getServerCartHydrated(): boolean {
  return false;
}

function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeCartHydration,
    getClientCartHydrated,
    getServerCartHydrated,
  );
}

/**
 * Client-side purchase action for SF-02.
 * Renders a single add-to-cart button when the product is not yet in `useCartStore`,
 * then switches to a live decimal-capable quantity stepper synced with `useCartStore`
 * once added. Sticky edge-to-edge on mobile, flat inline on desktop.
 *
 * @param props Normalized `StorefrontProduct` projection.
 * @returns Single CTA button or synced cart quantity stepper with stock ceiling feedback.
 */
export function ProductDetailActions({ product }: ProductDetailActionsProps) {
  const qtyInputId = useId();
  const isHydrated = useIsHydrated();
  const rawInCartQuantity = useCartStore(
    (state) =>
      state.items.find((item) => item.productId === product.id)?.quantity ?? 0,
  );
  const addItem = useCartStore((state) => state.addItem);
  const syncProductSnapshot = useCartStore(
    (state) => state.syncProductSnapshot,
  );
  const setQuantity = useCartStore((state) => state.setQuantity);
  const incrementItem = useCartStore((state) => state.incrementItem);
  const decrementItem = useCartStore((state) => state.decrementItem);

  const [draftQuantity, setDraftQuantity] = useState<string | null>(null);

  useEffect(() => {
    if (isHydrated) {
      syncProductSnapshot(product);
    }
  }, [isHydrated, product, syncProductSnapshot]);

  const normalizedAvailable = roundQuantity(
    Math.max(0, product.availableQuantity),
  );
  const isOutOfStock = normalizedAvailable <= 0;
  const inCartQuantity = isHydrated ? roundQuantity(rawInCartQuantity) : 0;
  const isInCart = inCartQuantity > 0;
  const isAtMaxStock = isInCart && inCartQuantity >= normalizedAvailable;

  function handleInitialAdd() {
    if (isOutOfStock) {
      return;
    }
    const initialQty = getDefaultOrderQuantity(normalizedAvailable);
    if (initialQty <= 0) {
      return;
    }
    addItem(product, initialQty);
    setDraftQuantity(null);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    setDraftQuantity(event.target.value);
  }

  function commitDraftQuantity() {
    if (draftQuantity === null) {
      return;
    }
    const parsed = parseOrderQuantityInput(draftQuantity);
    if (parsed !== null) {
      const clamped = clampOrderQuantity(parsed, normalizedAvailable);
      if (clamped > 0) {
        setQuantity(product.id, clamped);
      }
    }
    setDraftQuantity(null);
  }

  function handleDecrement() {
    setDraftQuantity(null);
    decrementItem(product.id);
  }

  function handleIncrement() {
    setDraftQuantity(null);
    incrementItem(product.id);
  }

  if (isOutOfStock) {
    return (
      <div className="border-t border-border-subtle bg-surface-card px-4 py-3 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
        <Alert className="rounded-lg border-border-subtle bg-surface-warm">
          <AlertCircle className="size-4 text-gray-500" aria-hidden="true" />
          <AlertDescription className="font-semibold text-gray-700">
            Sản phẩm hiện tạm hết hàng. Vui lòng quay lại sau đợt thu hoạch tiếp
            theo.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!isInCart) {
    return (
      <Button
        type="button"
        onClick={handleInitialAdd}
        className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-none border-0 bg-brand-forest px-6 text-sm font-bold text-white hover:bg-brand-dark focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:ring-offset-2 lg:h-11 lg:rounded-lg"
      >
        <ShoppingCart className="size-5 shrink-0" aria-hidden="true" />
        <span>THÊM VÀO GIỎ HÀNG</span>
      </Button>
    );
  }

  const displayedValue = draftQuantity ?? formatQuantityDisplay(inCartQuantity);

  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle bg-surface-card px-4 py-2.5 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-gray-600 lg:text-sm">
          Trong giỏ ({product.unit})
        </span>

        <div className="inline-flex items-center rounded-lg border border-brand-forest bg-green-50 transition-shadow focus-within:ring-2 focus-within:ring-brand-forest/30">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Giảm số lượng ${product.name}`}
            onClick={handleDecrement}
            className="size-10 rounded-l-lg text-brand-dark hover:bg-green-100"
          >
            <Minus className="size-4" aria-hidden="true" />
          </Button>
          <Label htmlFor={qtyInputId} className="sr-only">
            Số lượng ({product.unit})
          </Label>
          <Input
            id={qtyInputId}
            type="text"
            inputMode="decimal"
            value={displayedValue}
            onChange={handleInputChange}
            onBlur={commitDraftQuantity}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitDraftQuantity();
              }
            }}
            className="h-10 w-16 rounded-none border-0 bg-transparent px-1 text-center text-sm font-semibold text-brand-dark tabular-nums shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Tăng số lượng ${product.name}`}
            onClick={handleIncrement}
            disabled={isAtMaxStock}
            className="size-10 rounded-r-lg text-brand-dark hover:bg-green-100"
          >
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {isAtMaxStock ? (
        <p
          role="status"
          className="text-xs font-medium text-gray-600 tabular-nums"
        >
          Đã đạt tối đa tồn kho khả dụng (
          {formatQuantityDisplay(normalizedAvailable)} {product.unit}).
        </p>
      ) : null}
    </div>
  );
}
