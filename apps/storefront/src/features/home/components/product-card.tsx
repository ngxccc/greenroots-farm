"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
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
import type { StorefrontProduct } from "@/features/catalog/types/catalog.types";

interface ProductCardProps {
  readonly product: StorefrontProduct;
  readonly showStock?: boolean;
}

/**
 * Reusable storefront product card for both `SF-01` home shelves and `SF-02` catalog grids.
 *
 * @param props Product projection and optional `showStock` flag (enabled on `SF-02`).
 * @returns Bordered product card with inline cart quantity stepper.
 */
export function ProductCard({ product, showStock = false }: ProductCardProps) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
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
    product.salePriceVnd < product.basePriceVnd &&
    product.basePriceVnd > 0;
  const discountPct = hasMarkdown
    ? Math.max(
        1,
        Math.round(
          ((product.basePriceVnd - effectivePrice) / product.basePriceVnd) *
            100,
        ),
      )
    : 0;
  const isOutOfStock = normalizedAvailable <= 0;
  const showFallbackImage =
    !product.imageUrl || failedImageUrl === product.imageUrl;
  const clampedRescuePct =
    product.rescueBatchProgressPct !== undefined
      ? Math.min(100, Math.max(0, product.rescueBatchProgressPct))
      : undefined;

  return (
    <Card className="h-full gap-0 overflow-hidden rounded-sm border border-border-subtle bg-surface-card py-0 shadow-none transition-colors">
      <CardContent className="flex h-full flex-col p-0">
        <Link
          href={`/products/${product.slug}`}
          className="relative flex h-36 w-full items-center justify-center overflow-hidden bg-green-50"
        >
          {!showFallbackImage && product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              sizes="(max-width: 1024px) 50vw, 25vw"
              onError={() => setFailedImageUrl(product.imageUrl ?? null)}
              className={`object-cover ${isOutOfStock ? "opacity-50" : ""}`}
            />
          ) : (
            <div
              role="img"
              aria-label={product.name}
              className={`flex h-full w-full items-center justify-center bg-surface-warm text-brand-forest ${
                isOutOfStock ? "opacity-50" : ""
              }`}
            >
              <Leaf className="size-10 opacity-80" aria-hidden="true" />
            </div>
          )}
          {product.isRescueDeal && product.hoursRemaining ? (
            <Badge className="absolute top-1.5 left-1.5 rounded-sm border-0 bg-status-spoiled px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums">
              HSD còn {product.hoursRemaining}h
            </Badge>
          ) : null}
        </Link>

        <div className="flex flex-1 flex-col gap-2 p-2">
          <div className="flex flex-col gap-0.5">
            {(product.badgeText || showStock) && !product.isRescueDeal ? (
              <div className="flex items-center justify-between gap-1 text-[11px] font-medium">
                {product.badgeText ? (
                  <span className="truncate text-brand-dark">
                    {product.badgeText}
                  </span>
                ) : (
                  <span />
                )}
                {showStock ? (
                  <span
                    className={`shrink-0 tabular-nums ${
                      isOutOfStock
                        ? "text-light-on-surface-variant"
                        : "text-brand-forest"
                    }`}
                  >
                    {isOutOfStock
                      ? "Tạm hết hàng"
                      : `Còn ${normalizedAvailable} ${product.unit}`}
                  </span>
                ) : null}
              </div>
            ) : null}

            <Link
              href={`/products/${product.slug}`}
              className="line-clamp-2 text-sm font-semibold text-gray-900 hover:text-brand-forest"
            >
              {product.name}
            </Link>

            {!showStock && product.isRescueDeal ? (
              <p className="text-xs text-gray-500 tabular-nums">
                {product.unitLabel}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-baseline gap-x-1">
              <span
                className={`text-base font-bold tabular-nums ${
                  product.isRescueDeal
                    ? "text-status-spoiled"
                    : "text-brand-dark"
                }`}
              >
                {formatVnd(effectivePrice)}
              </span>
              <span className="text-xs text-gray-500 tabular-nums">
                /{product.unitLabel}
              </span>
            </div>

            {hasMarkdown ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500 tabular-nums line-through">
                  {formatVnd(product.basePriceVnd)}
                </span>
                <span className="rounded-sm bg-status-spoiled px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums">
                  -{discountPct}%
                </span>
              </div>
            ) : null}
          </div>

          {product.isRescueDeal && clampedRescuePct !== undefined ? (
            <div className="flex flex-col gap-1.5">
              <Progress
                variant="rescue"
                value={clampedRescuePct}
                aria-label={`Tiến độ giải cứu ${product.name}`}
              />
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-semibold text-status-spoiled tabular-nums">
                  Đã xuất {clampedRescuePct}%
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

        <footer className="mt-auto">
          {currentQty === 0 ? (
            <Button
              type="button"
              variant="ghost"
              disabled={isOutOfStock}
              onClick={() => addItem(product, 1)}
              className="h-9 w-full rounded-none border-0 border-t border-border-subtle bg-green-100 text-xs font-semibold text-brand-dark hover:bg-green-100/70! hover:text-brand-dark!"
            >
              {isOutOfStock ? "Tạm hết hàng" : "MUA NGAY"}
            </Button>
          ) : (
            <div className="flex h-9 items-center justify-between border-t border-border-subtle bg-green-50">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Giảm số lượng ${product.name}`}
                onClick={() => decrementItem(product.id)}
                className="h-9 w-9 rounded-none text-brand-dark hover:bg-green-100"
              >
                <Minus className="size-4" aria-hidden="true" />
              </Button>
              <span className="text-sm font-semibold text-brand-dark tabular-nums">
                {currentQty}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Tăng số lượng ${product.name}`}
                disabled={currentQty >= normalizedAvailable}
                onClick={() => incrementItem(product.id)}
                className="h-9 w-9 rounded-none text-brand-dark hover:bg-green-100"
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
  readonly columns?: 4 | 5;
}

/**
 * Responsive card grid placeholder matched to `ProductCard` geometry for route `<Suspense>` fallbacks.
 *
 * @param props Number of product card skeletons and desktop column count (`4` or `5`).
 * @returns Grid of decorative skeleton cards hidden from assistive tech.
 */
export function ProductGridSkeleton({
  count,
  columns = 5,
}: ProductGridSkeletonProps) {
  const gridColsClass =
    columns === 4
      ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5";

  return (
    <div className={gridColsClass}>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="flex flex-col overflow-hidden rounded-sm border border-border-subtle bg-surface-card"
        >
          <Skeleton className="h-36 w-full rounded-none bg-surface-warm" />
          <div className="space-y-2 p-2">
            <Skeleton className="h-3 w-16 bg-gray-200" />
            <Skeleton className="h-4 w-3/4 bg-gray-200" />
            <Skeleton className="h-5 w-1/2 bg-gray-200" />
          </div>
          <Skeleton className="mt-auto h-9 w-full rounded-none bg-green-100/70" />
        </div>
      ))}
    </div>
  );
}
