"use client";

import Link from "next/link";
import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  buttonVariants,
} from "@greenroots/ui";
import { AlertTriangle, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";
import { formatVnd } from "@/lib/format";
import { useCartStore } from "@/stores/cart.store";

interface CartDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function CartDrawer({ open, onOpenChange }: CartDrawerProps) {
  const items = useCartStore((state) => state.items);
  const incrementItem = useCartStore((state) => state.incrementItem);
  const decrementItem = useCartStore((state) => state.decrementItem);
  const removeItem = useCartStore((state) => state.removeItem);

  const subtotalVnd = items.reduce(
    (sum, item) => sum + item.unitPriceVnd * item.quantity,
    0,
  );
  const hasStockWarning = items.some(
    (item) => item.quantity >= item.availableQuantity,
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full bg-white p-0 sm:max-w-sm">
        <SheetHeader className="border-b border-border-subtle p-4">
          <SheetTitle className="flex items-center gap-2 font-bold text-gray-900">
            <ShoppingCart className="size-5 text-brand-forest" />
            Giỏ hàng của bạn ({items.length})
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="space-y-2 py-12 text-center">
              <ShoppingCart className="mx-auto size-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-700">
                Giỏ hàng đang trống
              </p>
              <p className="text-xs text-gray-500">
                Chọn rau củ tươi cắt lúc {FARM_METADATA.harvestTimeLabel} để
                thêm vào giỏ.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const atLimit = item.quantity >= item.availableQuantity;
              return (
                <div
                  key={item.productId}
                  className="space-y-2 rounded-xl border border-border-subtle bg-surface-warm p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {item.name}
                      </p>
                      <p className="text-xs text-gray-500">{item.unitLabel}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Xóa ${item.name}`}
                      onClick={() => removeItem(item.productId)}
                      className="text-gray-400 hover:text-status-spoiled"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-extrabold text-brand-forest">
                        {formatVnd(item.unitPriceVnd * item.quantity)}
                      </span>
                      {item.originalPriceVnd ? (
                        <span className="text-xs text-gray-400 line-through">
                          {formatVnd(item.originalPriceVnd * item.quantity)}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-white p-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Giảm ${item.name}`}
                        onClick={() => decrementItem(item.productId)}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <span className="w-6 text-center text-xs font-bold text-gray-900">
                        {item.quantity}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Tăng ${item.name}`}
                        disabled={atLimit}
                        onClick={() => incrementItem(item.productId)}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  {atLimit ? (
                    <Badge
                      variant="destructive"
                      className="w-full justify-start gap-1.5 rounded-md border border-red-200 bg-red-50 font-medium text-red-700"
                    >
                      <AlertTriangle className="size-3.5 shrink-0" />
                      Đã chạm ngưỡng tồn kho khả dụng ({item.availableQuantity})
                    </Badge>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <SheetFooter className="space-y-3 border-t border-border-subtle bg-white p-4">
          {hasStockWarning ? (
            <p className="text-xs font-medium text-red-600">
              Hệ thống sẽ xác thực lại tồn kho FEFO khi bạn xác nhận đơn hàng.
            </p>
          ) : null}
          <div className="flex items-center justify-between text-sm font-semibold">
            <span className="text-gray-700">Tạm tính</span>
            <span className="text-base font-extrabold text-brand-forest">
              {formatVnd(subtotalVnd)}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Phí ship tính theo khoảng cách thực tế tại bước thanh toán.
          </p>
          <Link
            href="/checkout"
            onClick={() => onOpenChange(false)}
            className={buttonVariants({
              className:
                "w-full h-11 bg-brand-forest hover:bg-brand-dark text-white font-bold rounded-xl",
            })}
          >
            Tiến hành thanh toán
          </Link>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
