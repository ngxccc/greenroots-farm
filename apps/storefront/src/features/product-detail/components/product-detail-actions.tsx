"use client";

import { useState, useSyncExternalStore, type ChangeEvent } from "react";
import { AlertCircle, Minus, Plus, ShoppingCart } from "lucide-react";
import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Label,
  toast,
} from "@greenroots/ui";
import { roundQuantity } from "@/lib/format";
import { useCartStore } from "@/stores/cart.store";
import type { StorefrontProduct } from "@/types/storefront.types";
import {
  PRODUCT_QUANTITY_MIN,
  PRODUCT_QUANTITY_STEP,
  clampOrderQuantity,
  formatQuantityDisplay,
  getDefaultOrderQuantity,
  getRemainingAddableQuantity,
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
 * Client-side quantity picker and add-to-cart action for SF-02.
 * Defaults to `1` when at least 1 unit remains, or exact fractional stock when `< 1`,
 * supports decimal quantity input, and clamps against remaining stock after subtracting
 * any quantity already held in `useCartStore`.
 *
 * @param props Normalized `StorefrontProduct` projection.
 * @returns Stock-clamped quantity controls and add-to-cart action.
 */
export function ProductDetailActions({ product }: ProductDetailActionsProps) {
  const isHydrated = useIsHydrated();
  const rawInCartQuantity = useCartStore(
    (state) =>
      state.items.find((item) => item.productId === product.id)?.quantity ?? 0,
  );
  const addItem = useCartStore((state) => state.addItem);

  const inCartQuantity = isHydrated ? rawInCartQuantity : 0;
  const remainingAddable = getRemainingAddableQuantity(
    product.availableQuantity,
    inCartQuantity,
  );
  const isOutOfStock = roundQuantity(product.availableQuantity) <= 0;
  const isCartAtLimit = !isOutOfStock && remainingAddable <= 0;

  const defaultQty = getDefaultOrderQuantity(remainingAddable);
  const [draftQuantity, setDraftQuantity] = useState<string | null>(null);

  const resolvedQuantity =
    draftQuantity !== null
      ? (() => {
          const parsed = parseOrderQuantityInput(draftQuantity);
          return parsed !== null
            ? clampOrderQuantity(parsed, remainingAddable)
            : defaultQty;
        })()
      : defaultQty;

  const displayedValue =
    draftQuantity ?? formatQuantityDisplay(resolvedQuantity);

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    setDraftQuantity(event.target.value);
  }

  function handleInputBlur() {
    if (remainingAddable <= 0) {
      setDraftQuantity(null);
      return;
    }
    if (draftQuantity === null) {
      return;
    }
    const parsed = parseOrderQuantityInput(draftQuantity);
    const nextQty =
      parsed === null
        ? getDefaultOrderQuantity(remainingAddable)
        : clampOrderQuantity(parsed, remainingAddable);
    setDraftQuantity(formatQuantityDisplay(nextQty));
  }

  function handleStep(delta: number) {
    if (remainingAddable <= 0) {
      return;
    }
    const baseQty =
      draftQuantity !== null
        ? (parseOrderQuantityInput(draftQuantity) ?? resolvedQuantity)
        : resolvedQuantity;
    const nextQty = clampOrderQuantity(
      roundQuantity(baseQty + delta),
      remainingAddable,
    );
    setDraftQuantity(formatQuantityDisplay(nextQty));
  }

  function handleAddToCart() {
    if (remainingAddable <= 0) {
      return;
    }
    const parsed =
      draftQuantity !== null ? parseOrderQuantityInput(draftQuantity) : null;
    const quantityToAdd = clampOrderQuantity(
      parsed ?? resolvedQuantity,
      remainingAddable,
    );
    if (quantityToAdd <= 0) {
      return;
    }

    addItem(product, quantityToAdd);
    setDraftQuantity(null);
    toast.success(
      `Đã thêm ${formatQuantityDisplay(quantityToAdd)} ${product.unit} ${product.name} vào giỏ hàng`,
    );
  }

  if (isOutOfStock) {
    return (
      <Alert className="rounded-xl border-border-subtle bg-surface-warm">
        <AlertCircle className="size-4 text-gray-500" aria-hidden="true" />
        <AlertDescription className="font-semibold text-gray-700">
          Sản phẩm hiện tạm hết hàng. Vui lòng quay lại sau đợt thu hoạch tiếp
          theo.
        </AlertDescription>
      </Alert>
    );
  }

  if (isCartAtLimit) {
    return (
      <Alert className="rounded-xl border-border-subtle bg-surface-warm">
        <AlertCircle className="size-4 text-brand-forest" aria-hidden="true" />
        <AlertDescription className="text-gray-700 tabular-nums">
          Giỏ hàng của bạn đã đạt tối đa tồn kho khả dụng (
          {formatQuantityDisplay(product.availableQuantity)} {product.unit}).
        </AlertDescription>
      </Alert>
    );
  }

  const minAllowed = Math.min(PRODUCT_QUANTITY_MIN, remainingAddable);

  return (
    <div className="flex flex-col gap-2 lg:gap-3 lg:pt-1">
      <div className="flex items-center gap-3 lg:flex-wrap lg:gap-4">
        <div className="inline-flex shrink-0 items-center rounded-xl border border-border-subtle bg-surface-card transition-shadow focus-within:border-brand-forest focus-within:ring-2 focus-within:ring-brand-forest/30">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Giảm số lượng"
            onClick={() => handleStep(-PRODUCT_QUANTITY_STEP)}
            disabled={resolvedQuantity <= minAllowed}
            className="size-10 rounded-l-xl text-gray-700 hover:bg-gray-50 lg:size-11"
          >
            <Minus className="size-4" aria-hidden="true" />
          </Button>
          <Label htmlFor="product-detail-qty" className="sr-only">
            Số lượng ({product.unit})
          </Label>
          <Input
            id="product-detail-qty"
            type="text"
            inputMode="decimal"
            aria-label={`Số lượng (${product.unit})`}
            value={displayedValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            className="h-10 w-12 rounded-none border-0 bg-transparent px-1 text-center text-sm font-semibold text-gray-900 tabular-nums shadow-none focus-visible:ring-0 lg:h-11 lg:w-16"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Tăng số lượng"
            onClick={() => handleStep(PRODUCT_QUANTITY_STEP)}
            disabled={resolvedQuantity >= remainingAddable}
            className="size-10 rounded-r-xl text-gray-700 hover:bg-gray-50 lg:size-11"
          >
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <Button
          type="button"
          onClick={handleAddToCart}
          className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-forest px-4 text-sm font-bold text-white hover:bg-brand-dark focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:ring-offset-2 lg:h-11 lg:min-w-50 lg:px-6"
        >
          <ShoppingCart className="size-5 shrink-0" aria-hidden="true" />
          <span className="truncate">THÊM VÀO GIỎ HÀNG</span>
        </Button>
      </div>

      {inCartQuantity > 0 ? (
        <p className="text-xs text-gray-600 tabular-nums">
          Đang có {formatQuantityDisplay(inCartQuantity)} {product.unit} trong
          giỏ hàng · Có thể thêm tối đa{" "}
          {formatQuantityDisplay(remainingAddable)} {product.unit}
        </p>
      ) : null}
    </div>
  );
}
