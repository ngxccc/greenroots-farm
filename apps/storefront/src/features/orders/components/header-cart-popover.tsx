"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Badge,
  Popover,
  PopoverContent,
  PopoverTrigger,
  buttonVariants,
} from "@greenroots/ui";
import { ShoppingCart } from "lucide-react";
import { formatVnd, roundQuantity } from "@/lib/format";
import { useCartStore } from "@/stores/cart.store";
import { useCartHydrated } from "../hooks/use-validated-cart";

const MAX_PREVIEW_ITEMS = 5;
const HOVER_CLOSE_DELAY_MS = 150;

/**
 * Header shopping-cart trigger with a desktop hover `Popover` preview reading
 * strictly from `useCartStore` (zero API calls on hover). Clicking navigates to `/cart`.
 */
export function HeaderCartPopover() {
  const isHydrated = useCartHydrated();
  const storedItems = useCartStore((state) => state.items);
  const items = isHydrated ? storedItems : [];
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const itemCount = items.length;
  const subtotalVnd = items.reduce(
    (sum, item) => sum + Math.round(item.unitPriceVnd * item.quantity),
    0,
  );

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  function handleOpen() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setOpen(true);
  }

  function handleScheduleClose() {
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
    }, HOVER_CLOSE_DELAY_MS);
  }

  return (
    <>
      <Link
        href="/cart"
        aria-label={`Giỏ hàng (${itemCount} sản phẩm)`}
        className="relative inline-flex items-center justify-center rounded px-0.5 py-1 text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none md:hidden"
      >
        <ShoppingCart className="size-6" aria-hidden="true" />
        <Badge
          role="status"
          className="absolute -top-1.5 -right-2 h-4 min-w-4 border-0 bg-white px-1 text-[11px] font-semibold text-brand-dark tabular-nums"
        >
          {itemCount}
        </Badge>
      </Link>

      <div className="hidden md:block">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            nativeButton={false}
            render={
              <Link
                href="/cart"
                aria-label={`Giỏ hàng (${itemCount} sản phẩm)`}
                onMouseEnter={handleOpen}
                onMouseLeave={handleScheduleClose}
                onClick={() => setOpen(false)}
                className="relative inline-flex items-center justify-center rounded px-1.5 py-1 text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
              />
            }
          >
            <ShoppingCart className="size-6" aria-hidden="true" />
            <Badge
              role="status"
              className="absolute -top-1.5 -right-2 h-4 min-w-4 border-0 bg-white px-1 text-[11px] font-semibold text-brand-dark tabular-nums"
            >
              {itemCount}
            </Badge>
          </PopoverTrigger>

          <PopoverContent
            align="end"
            sideOffset={10}
            onMouseEnter={handleOpen}
            onMouseLeave={handleScheduleClose}
            className="w-80 border border-border-subtle bg-surface-card p-4 text-gray-900 shadow-lg"
          >
            {items.length === 0 ? (
              <div className="space-y-2 py-4 text-center">
                <p className="text-sm font-semibold text-gray-900">
                  Giỏ hàng đang trống
                </p>
                <p className="text-xs text-gray-500">
                  Thêm rau củ hữu cơ tươi cắt sáng nay để bắt đầu đơn hàng.
                </p>
                <Link
                  href="/products"
                  onClick={() => setOpen(false)}
                  className={buttonVariants({
                    size: "sm",
                    className:
                      "mt-2 w-full bg-brand-forest font-semibold text-white hover:bg-brand-dark",
                  })}
                >
                  Khám phá sản phẩm
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                  <span className="text-xs font-bold text-gray-900">
                    Sản phẩm trong giỏ
                  </span>
                  <span className="text-xs font-semibold text-brand-dark tabular-nums">
                    {itemCount} sản phẩm
                  </span>
                </div>

                <ul className="max-h-60 divide-y divide-border-subtle overflow-y-auto">
                  {items.slice(0, MAX_PREVIEW_ITEMS).map((item) => (
                    <li
                      key={item.productId}
                      className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-gray-900">
                          {item.name}
                        </p>
                        <p className="text-[11px] text-gray-500 tabular-nums">
                          {roundQuantity(item.quantity)} ×{" "}
                          {formatVnd(item.unitPriceVnd)} ({item.unitLabel})
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-brand-forest tabular-nums">
                        {formatVnd(item.unitPriceVnd * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>

                {items.length > MAX_PREVIEW_ITEMS ? (
                  <p className="text-[11px] text-gray-500">
                    +{items.length - MAX_PREVIEW_ITEMS} sản phẩm khác trong giỏ
                  </p>
                ) : null}

                <div className="flex items-center justify-between border-t border-border-subtle pt-2.5">
                  <span className="text-xs text-gray-600">Tạm tính</span>
                  <span className="text-sm font-extrabold text-brand-forest tabular-nums">
                    {formatVnd(subtotalVnd)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/cart"
                    onClick={() => setOpen(false)}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "w-full font-semibold",
                    })}
                  >
                    Xem giỏ hàng
                  </Link>
                  <Link
                    href="/checkout"
                    onClick={() => setOpen(false)}
                    className={buttonVariants({
                      size: "sm",
                      className:
                        "w-full bg-brand-forest font-semibold text-white hover:bg-brand-dark",
                    })}
                  >
                    Thanh toán
                  </Link>
                </div>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}
