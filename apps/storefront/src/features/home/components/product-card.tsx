"use client";

import Link from "next/link";
import { Badge, Button, Card, CardContent } from "@greenroots/ui";
import { Leaf, Minus, Plus } from "lucide-react";
import { formatVnd } from "@/lib/format";
import { useCartStore } from "@/stores/cart.store";
import type { StorefrontProduct } from "@/types/storefront.types";

interface ProductCardProps {
  readonly product: StorefrontProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  const items = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const incrementItem = useCartStore((state) => state.incrementItem);
  const decrementItem = useCartStore((state) => state.decrementItem);

  const cartItem = items.find((item) => item.productId === product.id);
  const currentQty = cartItem?.quantity ?? 0;
  const effectivePrice = product.salePriceVnd ?? product.basePriceVnd;

  return (
    <Card
      className={`gap-0 overflow-hidden border bg-white py-0 shadow-sm transition hover:shadow-md ${
        product.isRescueDeal
          ? "border-red-100 hover:border-red-200"
          : "border-border-subtle"
      }`}
    >
      <Link
        href={`/products/${product.slug}`}
        className="relative flex h-36 items-center justify-center bg-green-50/60 p-3"
      >
        <Leaf className="size-12 text-brand-forest/70" />
        {product.isRescueDeal && product.hoursRemaining ? (
          <Badge className="absolute top-2 left-2 border-0 bg-red-600 text-[11px] font-bold text-white">
            HSD còn {product.hoursRemaining}h
          </Badge>
        ) : null}
      </Link>

      <CardContent className="flex flex-1 flex-col justify-between gap-2.5 p-3">
        <div>
          <Link
            href={`/products/${product.slug}`}
            className="line-clamp-1 text-sm font-bold text-gray-900 hover:text-brand-forest"
          >
            {product.name}
          </Link>
          <p className="mt-0.5 text-xs text-gray-500">
            {product.isRescueDeal
              ? product.unitLabel
              : `${product.unitLabel} · Còn ${product.availableQuantity} ${product.unit}`}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-base font-extrabold ${
                product.isRescueDeal ? "text-red-600" : "text-brand-forest"
              }`}
            >
              {formatVnd(effectivePrice)}
            </span>
            {product.salePriceVnd ? (
              <span className="text-xs text-gray-400 line-through">
                {formatVnd(product.basePriceVnd)}
              </span>
            ) : null}
          </div>
          {product.isRescueDeal &&
          product.rescueBatchProgressPct !== undefined ? (
            <div className="space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-red-100">
                <div
                  className="h-1.5 rounded-full bg-red-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, product.rescueBatchProgressPct))}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-bold text-red-600">
                  Đã xuất {product.rescueBatchProgressPct}%
                </span>
                <span className="text-gray-500">
                  Còn {product.availableQuantity} {product.unit}
                </span>
              </div>
            </div>
          ) : null}

          {currentQty === 0 ? (
            <Button
              type="button"
              onClick={() => addItem(product, 1)}
              className="h-10 w-full rounded-xl bg-brand-forest text-xs font-bold text-white hover:bg-brand-dark"
            >
              MUA NGAY
            </Button>
          ) : (
            <div className="flex h-10 items-center justify-between rounded-xl border border-brand-forest bg-green-50/70 px-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Giảm ${product.name}`}
                onClick={() => decrementItem(product.id)}
                className="text-brand-dark hover:bg-green-100"
              >
                <Minus className="size-4" />
              </Button>
              <span className="text-sm font-extrabold text-brand-dark">
                {currentQty}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Tăng ${product.name}`}
                disabled={currentQty >= product.availableQuantity}
                onClick={() => incrementItem(product.id)}
                className="text-brand-dark hover:bg-green-100"
              >
                <Plus className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
