"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Progress,
  Skeleton,
} from "@greenroots/ui";
import { Leaf, Minus, Plus } from "lucide-react";
import { formatVnd, roundQuantity } from "@/lib/format";
import { useCartStore } from "@/stores/cart.store";
import type { StorefrontProduct } from "@/types/storefront.types";

interface ProductCardProps {
  readonly product: StorefrontProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  const items = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const syncProductSnapshot = useCartStore(
    (state) => state.syncProductSnapshot,
  );
  const incrementItem = useCartStore((state) => state.incrementItem);
  const decrementItem = useCartStore((state) => state.decrementItem);

  const cartItem = items.find((item) => item.productId === product.id);

  useEffect(() => {
    if (cartItem) {
      syncProductSnapshot(product);
    }
  }, [cartItem, product, syncProductSnapshot]);

  const currentQty = roundQuantity(cartItem?.quantity ?? 0);
  const normalizedAvailable = roundQuantity(
    Math.max(0, product.availableQuantity),
  );
  const effectivePrice = product.salePriceVnd ?? product.basePriceVnd;
  const hasMarkdown =
    product.salePriceVnd !== undefined &&
    product.salePriceVnd < product.basePriceVnd;
  const isOutOfStock = normalizedAvailable <= 0;

  return (
    <Card className="h-full gap-0 rounded-xl border-border-subtle bg-white py-0 shadow-none transition-colors hover:border-brand-forest">
      <CardContent className="flex h-full flex-col justify-between gap-4 p-4">
        <div className="flex flex-col gap-2">
          <Link
            href={`/products/${product.slug}`}
            className="relative flex h-36 items-center justify-center overflow-hidden rounded-lg bg-green-50"
          >
            <Leaf className="size-12 text-brand-forest/70" aria-hidden="true" />
            {product.isRescueDeal && product.hoursRemaining ? (
              <Badge className="absolute top-2 left-2 rounded-full border-0 bg-status-spoiled px-2.5 py-0.5 text-[11px] font-semibold text-white tabular-nums">
                HSD còn {product.hoursRemaining}h
              </Badge>
            ) : null}
          </Link>

          <div className="flex flex-col gap-0.5">
            <Link
              href={`/products/${product.slug}`}
              className="line-clamp-1 text-[15px] font-semibold text-gray-900 hover:text-brand-forest"
            >
              {product.name}
            </Link>
            <p className="text-xs text-gray-500 tabular-nums">
              {product.isRescueDeal || !product.badgeText
                ? product.unitLabel
                : `${product.unitLabel}, ${product.badgeText}`}
            </p>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span
              className={`text-lg font-bold tabular-nums ${
                product.isRescueDeal ? "text-status-spoiled" : "text-brand-dark"
              }`}
            >
              {formatVnd(effectivePrice)}
            </span>
            {hasMarkdown ? (
              <span className="text-xs text-gray-500 tabular-nums line-through">
                {formatVnd(product.basePriceVnd)}
              </span>
            ) : null}
          </div>

          {product.isRescueDeal &&
          product.rescueBatchProgressPct !== undefined ? (
            <div className="flex flex-col gap-1.5">
              <Progress
                variant="rescue"
                value={Math.min(
                  100,
                  Math.max(0, product.rescueBatchProgressPct),
                )}
                aria-label={`Tiến độ giải cứu ${product.name}`}
              />
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-semibold text-status-spoiled tabular-nums">
                  Đã xuất {product.rescueBatchProgressPct}%
                </span>
                <span className="text-xs text-gray-500 tabular-nums">
                  {isOutOfStock
                    ? "Tạm hết hàng"
                    : `Còn ${product.availableQuantity} ${product.unit}`}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <footer>
          {currentQty === 0 ? (
            <Button
              type="button"
              disabled={isOutOfStock}
              onClick={() => addItem(product, 1)}
              className="h-10 w-full rounded-lg bg-brand-forest text-sm font-semibold text-white hover:bg-brand-dark"
            >
              {isOutOfStock ? "Tạm hết hàng" : "MUA NGAY"}
            </Button>
          ) : (
            <div className="flex h-10 items-center justify-between rounded-lg border border-brand-forest bg-green-50">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Giảm số lượng ${product.name}`}
                onClick={() => decrementItem(product.id)}
                className="h-10 w-10 rounded-l-lg text-brand-dark hover:bg-green-100"
              >
                <Minus className="size-4" aria-hidden="true" />
              </Button>
              <span className="text-[15px] font-semibold text-brand-dark tabular-nums">
                {currentQty}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Tăng số lượng ${product.name}`}
                disabled={currentQty >= normalizedAvailable}
                onClick={() => incrementItem(product.id)}
                className="h-10 w-10 rounded-r-lg text-brand-dark hover:bg-green-100"
              >
                <Plus className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </footer>
      </CardContent>
    </Card>
  );
}

interface ProductGridSkeletonProps {
  readonly count: number;
}

/**
 * Responsive card grid placeholder matched to `ProductCard` geometry for route `<Suspense>` fallbacks.
 *
 * @param props Number of product card skeletons to display.
 * @returns Grid of decorative skeleton cards hidden from assistive tech.
 */
export function ProductGridSkeleton({ count }: ProductGridSkeletonProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="space-y-3 rounded-xl border border-border-subtle bg-white p-3"
        >
          <Skeleton className="h-36 w-full rounded-lg bg-green-50" />
          <Skeleton className="h-4 w-3/4 bg-gray-200" />
          <Skeleton className="h-4 w-1/2 bg-gray-200" />
          <Skeleton className="h-10 w-full rounded-lg bg-green-100/70" />
        </div>
      ))}
    </div>
  );
}
