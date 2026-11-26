"use client";

import Link from "next/link";
import { useMemo } from "react";
import { UserRole } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Progress,
  buttonVariants,
} from "@greenroots/ui";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";
import { formatVnd, roundQuantity } from "@/lib/format";
import { useAuthStore } from "@/stores/auth.store";
import { useCartStore } from "@/stores/cart.store";
import { useDeliveryAddressStore } from "@/stores/delivery-address.store";
import { useCartHydrated, useValidatedCart } from "../hooks/use-validated-cart";
import { calculateMovProgress } from "../utils/order-checkout.utils";

/**
 * Dedicated `/cart` page displaying cart items, `BUSINESS_RULES.MIN_ORDER_VALUE_VND`
 * progress bar, and live `POST /api/v1/orders/validate-cart` stock/price reconciliation
 * for authenticated customers.
 */
export function CartPageView() {
  const isHydrated = useCartHydrated();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const selectedAddressId = useDeliveryAddressStore(
    (state) => state.selectedAddressId,
  );

  const storedItems = useCartStore((state) => state.items);
  const items = useMemo(
    () => (isHydrated ? storedItems : []),
    [isHydrated, storedItems],
  );
  const incrementItem = useCartStore((state) => state.incrementItem);
  const decrementItem = useCartStore((state) => state.decrementItem);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const removeItem = useCartStore((state) => state.removeItem);

  const isCustomer = user?.role === UserRole.CUSTOMER;

  const {
    localSubtotalVnd,
    validation,
    validationError,
    isValidating,
    priceUpdatedIds,
  } = useValidatedCart({
    enabled: isHydrated && isCustomer,
    items,
    addressId: selectedAddressId,
    debounceMs: 250,
    onSessionInvalidated: clearSession,
  });

  const effectiveSubtotalVnd = validation?.subtotalVnd ?? localSubtotalVnd;
  const mov = calculateMovProgress(effectiveSubtotalVnd);

  const serverItemsById = useMemo(
    () =>
      new Map(validation?.items.map((item) => [item.productId, item]) ?? []),
    [validation],
  );

  const hasBlockingItemIssues = useMemo(
    () =>
      validation?.items.some(
        (item) => item.issue !== null || !item.isAvailable,
      ) ?? false,
    [validation],
  );

  const canProceedCheckout =
    isHydrated &&
    items.length > 0 &&
    mov.meetsMinOrderValue &&
    !hasBlockingItemIssues &&
    (!isCustomer || (!isValidating && validation !== null));

  const itemCount = items.length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6 lg:py-8">
      <div className="flex flex-col gap-2 border-b border-border-subtle pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">
              Giỏ hàng của bạn
            </h1>
            <p className="text-sm text-gray-600">
              Rau củ hữu cơ thu hoạch lúc {FARM_METADATA.harvestTimeLabel} và
              vận chuyển xe lạnh.
            </p>
          </div>
          {isValidating ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Đang kiểm tra tồn kho...
            </span>
          ) : null}
        </div>
      </div>

      {!isHydrated ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Đang tải giỏ hàng...
        </div>
      ) : items.length === 0 ? (
        <section className="mx-auto my-8 flex max-w-md flex-col items-center gap-4 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-green-50 text-brand-forest">
            <ShoppingCart className="size-8" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-gray-900">
              Giỏ hàng của bạn đang trống
            </h2>
            <p className="text-sm text-gray-600">
              Hãy chọn thêm rau củ hữu cơ tươi sạch để bắt đầu đơn hàng.
            </p>
          </div>
          <Link
            href="/products"
            className={buttonVariants({
              className:
                "bg-brand-forest font-bold text-white hover:bg-brand-dark",
            })}
          >
            Khám phá rau củ hữu cơ
          </Link>
        </section>
      ) : (
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-7">
            {validationError ? (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" aria-hidden="true" />
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            ) : null}

            <section
              aria-label="Danh sách sản phẩm trong giỏ"
              className="divide-y divide-border-subtle border-y border-border-subtle"
            >
              {items.map((item) => {
                const serverItem = serverItemsById.get(item.productId);
                const displayQty = roundQuantity(item.quantity);
                const effectiveAvailable = roundQuantity(
                  serverItem?.availableQuantity ?? item.availableQuantity,
                );
                const atLimit = displayQty >= effectiveAvailable;
                const priceChanged = priceUpdatedIds.includes(item.productId);
                const isUnavailable =
                  serverItem?.issue === "PRODUCT_UNAVAILABLE";
                const isInsufficient =
                  serverItem?.issue === "INSUFFICIENT_STOCK";

                return (
                  <div
                    key={item.productId}
                    className="flex flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/products/${item.slug}`}
                          className="text-sm font-bold text-gray-900 hover:text-brand-forest"
                        >
                          {item.name}
                        </Link>
                        <span className="text-xs text-gray-500">
                          ({item.unitLabel})
                        </span>
                      </div>

                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold text-brand-forest tabular-nums">
                          {formatVnd(item.unitPriceVnd)}
                        </span>
                        {item.originalPriceVnd ? (
                          <span className="text-xs text-gray-400 tabular-nums line-through">
                            {formatVnd(item.originalPriceVnd)}
                          </span>
                        ) : null}
                      </div>

                      {priceChanged ? (
                        <p className="text-xs font-medium text-amber-700">
                          Giá vừa được cập nhật theo nông trại.
                        </p>
                      ) : null}

                      {isUnavailable ? (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Badge
                            variant="outline"
                            className="border-destructive bg-surface-card text-destructive"
                          >
                            Sản phẩm tạm ngừng bán
                          </Badge>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => removeItem(item.productId)}
                          >
                            Xóa khỏi giỏ
                          </Button>
                        </div>
                      ) : null}

                      {isInsufficient ? (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Badge
                            variant="outline"
                            className="border-destructive bg-surface-card text-destructive tabular-nums"
                          >
                            Chỉ còn {effectiveAvailable} {item.unitLabel}
                          </Badge>
                          {effectiveAvailable > 0 ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              onClick={() =>
                                setQuantity(item.productId, effectiveAvailable)
                              }
                            >
                              Điều chỉnh về {effectiveAvailable}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              onClick={() => removeItem(item.productId)}
                            >
                              Xóa khỏi giỏ
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="inline-flex items-center rounded-lg border border-border-subtle bg-surface-card p-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Giảm ${item.name}`}
                          onClick={() => decrementItem(item.productId)}
                        >
                          <Minus className="size-3.5" aria-hidden="true" />
                        </Button>
                        <span className="min-w-8 px-1 text-center text-xs font-bold text-gray-900 tabular-nums">
                          {displayQty}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Tăng ${item.name}`}
                          disabled={atLimit || isUnavailable}
                          onClick={() => incrementItem(item.productId)}
                        >
                          <Plus className="size-3.5" aria-hidden="true" />
                        </Button>
                      </div>

                      <span className="w-24 text-right text-sm font-extrabold text-gray-900 tabular-nums">
                        {formatVnd(item.unitPriceVnd * item.quantity)}
                      </span>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Xóa ${item.name}`}
                        onClick={() => removeItem(item.productId)}
                        className="text-gray-400 hover:text-status-spoiled"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </section>
          </div>

          <aside className="flex flex-col gap-4 border-t border-border-subtle pt-6 lg:sticky lg:top-20 lg:col-span-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <h2 className="text-lg font-bold text-gray-900">
              Tóm tắt giỏ hàng ({itemCount} sản phẩm)
            </h2>

            <div className="space-y-2 border-b border-border-subtle pb-4">
              <div className="flex items-center justify-between text-xs font-medium">
                {mov.meetsMinOrderValue ? (
                  <span className="inline-flex items-center gap-1.5 text-brand-dark">
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    Đã đạt giá trị đơn tối thiểu (
                    {formatVnd(mov.minOrderValueVnd)})
                  </span>
                ) : (
                  <span className="text-gray-700 tabular-nums">
                    Mua thêm{" "}
                    <strong className="text-brand-forest">
                      {formatVnd(mov.remainingVnd)}
                    </strong>{" "}
                    để đạt đơn tối thiểu {formatVnd(mov.minOrderValueVnd)}
                  </span>
                )}
                <span className="font-semibold text-gray-600 tabular-nums">
                  {mov.progressPercent}%
                </span>
              </div>
              <Progress value={mov.progressPercent} />
            </div>

            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-gray-700">
                Tạm tính tiền hàng
              </span>
              <span className="text-xl font-extrabold text-brand-forest tabular-nums">
                {formatVnd(effectiveSubtotalVnd)}
              </span>
            </div>

            <p className="text-xs text-gray-500">
              Phí giao xe lạnh và điểm thưởng sẽ được tính chính xác tại bước
              thanh toán theo địa chỉ nhận hàng.
            </p>

            {canProceedCheckout ? (
              <Link
                href="/checkout"
                className={buttonVariants({
                  className:
                    "h-11 w-full gap-2 bg-brand-forest font-bold text-white hover:bg-brand-dark",
                })}
              >
                <span>Tiến hành thanh toán</span>
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <Button type="button" disabled className="h-11 w-full font-bold">
                {hasBlockingItemIssues
                  ? "Vui lòng xử lý sản phẩm hết hàng"
                  : isValidating
                    ? "Đang kiểm tra tồn kho..."
                    : `Đơn tối thiểu ${formatVnd(mov.minOrderValueVnd)}`}
              </Button>
            )}

            <Link
              href="/products"
              className={buttonVariants({
                variant: "outline",
                className: "w-full font-semibold",
              })}
            >
              Tiếp tục mua sắm
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
