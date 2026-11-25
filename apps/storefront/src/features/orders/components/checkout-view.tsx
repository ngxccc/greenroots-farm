"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BUSINESS_RULES, UserRole } from "@greenroots/shared";
import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Skeleton,
  buttonVariants,
} from "@greenroots/ui";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Loader2,
  MapPin,
  Plus,
  ShoppingBag,
} from "lucide-react";
import { AddressDialog } from "@/components/common/address-dialog";
import { DeliveryQuoteSummary } from "@/components/common/delivery-quote-summary";
import { listAddressesAction } from "@/features/account/actions/address-actions";
import { formatVnd, roundQuantity } from "@/lib/format";
import { useAuthStore } from "@/stores/auth.store";
import { useCartStore } from "@/stores/cart.store";
import {
  findActiveDeliveryAddress,
  useDeliveryAddressStore,
} from "@/stores/delivery-address.store";
import { checkoutCodAction } from "../actions/order-actions";
import { useCartHydrated, useValidatedCart } from "../hooks/use-validated-cart";
import type { OrderDto } from "../schemas/order.schema";
import {
  buildCheckoutPayloadSignature,
  clampLoyaltyPoints,
} from "../utils/order-checkout.utils";
import { CodConfirmationView } from "./cod-confirmation-view";

/**
 * `SF-05` COD Checkout screen: enforces customer auth, saved address selection
 * (`AddressDialog` + `DeliveryQuoteSummary`), optional loyalty redemption
 * (`1 pt = 1 VND` on subtotal), UUID `Idempotency-Key` protection, and inline
 * confirmation transition.
 */
export function CheckoutView() {
  const router = useRouter();
  const isCartHydrated = useCartHydrated();
  const user = useAuthStore((state) => state.user);
  const isAuthHydrated = useAuthStore((state) => state.isHydrated);
  const clearSession = useAuthStore((state) => state.clearSession);

  const storedItems = useCartStore((state) => state.items);
  const items = useMemo(
    () => (isCartHydrated ? storedItems : []),
    [isCartHydrated, storedItems],
  );
  const clearCart = useCartStore((state) => state.clearCart);

  const addresses = useDeliveryAddressStore((state) => state.addresses);
  const selectedAddressId = useDeliveryAddressStore(
    (state) => state.selectedAddressId,
  );
  const isAddressesHydrated = useDeliveryAddressStore(
    (state) => state.isHydrated,
  );
  const setAddresses = useDeliveryAddressStore((state) => state.setAddresses);
  const selectSavedAddress = useDeliveryAddressStore(
    (state) => state.selectSavedAddress,
  );

  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [useMaxLoyalty, setUseMaxLoyalty] = useState(false);
  const [requestedLoyaltyInput, setRequestedLoyaltyInput] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<OrderDto | null>(null);

  const idempotencyRef = useRef<{ signature: string; key: string } | null>(
    null,
  );

  const isCustomer = user?.role === UserRole.CUSTOMER;
  const activeAddress = useMemo(
    () => findActiveDeliveryAddress(addresses, selectedAddressId),
    [addresses, selectedAddressId],
  );

  // Redirect unauthenticated guests to login preserving `/checkout` return path.
  useEffect(() => {
    if (isAuthHydrated && !user && !confirmedOrder) {
      router.replace("/login?redirect=/checkout");
    }
  }, [confirmedOrder, isAuthHydrated, router, user]);

  // Hydrate saved addresses once per authenticated customer session.
  useEffect(() => {
    if (!isCustomer || isAddressesHydrated) {
      return;
    }

    let cancelled = false;
    void listAddressesAction().then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setAddresses(result.addresses);
      } else if (result.sessionInvalidated) {
        clearSession();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [clearSession, isAddressesHydrated, isCustomer, setAddresses]);

  const initialSubtotalVnd = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + Math.round(item.unitPriceVnd * item.quantity),
        0,
      ),
    [items],
  );

  const availableLoyaltyBalance = user?.rewardPoints ?? 0;

  const effectiveLoyaltyPoints = useMemo(() => {
    if (useMaxLoyalty) {
      return clampLoyaltyPoints(
        availableLoyaltyBalance,
        availableLoyaltyBalance,
        initialSubtotalVnd,
      );
    }
    return clampLoyaltyPoints(
      requestedLoyaltyInput,
      availableLoyaltyBalance,
      initialSubtotalVnd,
    );
  }, [
    availableLoyaltyBalance,
    initialSubtotalVnd,
    requestedLoyaltyInput,
    useMaxLoyalty,
  ]);

  const {
    localSubtotalVnd,
    validation,
    validationError,
    isValidating,
    retry: retryValidation,
  } = useValidatedCart({
    enabled: isCartHydrated && isCustomer && !confirmedOrder,
    items,
    addressId: activeAddress?.id ?? null,
    loyaltyPoints: effectiveLoyaltyPoints,
    debounceMs: 200,
    onSessionInvalidated: clearSession,
  });

  if (confirmedOrder) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-6">
        <CodConfirmationView order={confirmedOrder} />
      </div>
    );
  }

  if (!isAuthHydrated || !isCartHydrated || !user) {
    return (
      <div className="mx-auto flex max-w-2xl items-center justify-center gap-2 px-4 py-16 text-sm text-gray-600">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Đang tải thông tin thanh toán...
      </div>
    );
  }

  if (!isCustomer) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertDescription>
            Tài khoản quản trị/nhân viên không thể đặt hàng trên cửa hàng khách
            hàng. Vui lòng đăng nhập bằng tài khoản khách hàng.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
        <ShoppingBag className="size-10 text-gray-300" aria-hidden="true" />
        <h1 className="text-lg font-bold text-gray-900">
          Chưa có sản phẩm để thanh toán
        </h1>
        <p className="text-sm text-gray-600">
          Hãy chọn rau củ hữu cơ vào giỏ trước khi tiến hành thanh toán.
        </p>
        <Link
          href="/products"
          className={buttonVariants({
            className:
              "bg-brand-forest font-bold text-white hover:bg-brand-dark",
          })}
        >
          Khám phá sản phẩm
        </Link>
      </div>
    );
  }

  const effectiveSubtotalVnd = validation?.subtotalVnd ?? localSubtotalVnd;
  const availableLoyaltyPoints =
    validation?.availableLoyaltyPoints ?? availableLoyaltyBalance;
  const shippingFeeVnd = validation?.shipping?.feeVnd ?? 0;
  const discountVnd = validation?.discountAmountVnd ?? effectiveLoyaltyPoints;
  const displayTotalVnd =
    validation?.totalAmountVnd ??
    Math.max(0, effectiveSubtotalVnd - discountVnd + shippingFeeVnd);

  const meetsMov =
    validation?.meetsMinOrderValue ??
    effectiveSubtotalVnd >= BUSINESS_RULES.MIN_ORDER_VALUE_VND;
  const isDeliverable = validation?.shipping?.isDeliverable ?? false;
  const hasStockIssues =
    validation?.items.some((i) => i.issue !== null || !i.isAvailable) ?? false;

  const canSubmit =
    !isSubmitting &&
    !isValidating &&
    validation !== null &&
    Boolean(activeAddress) &&
    meetsMov &&
    isDeliverable &&
    !hasStockIssues;

  const activeError = submitError ?? validationError;

  async function handlePlaceOrder() {
    if (!activeAddress || isSubmitting) {
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    const payloadItems = items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
    const signature = buildCheckoutPayloadSignature({
      items: payloadItems,
      addressId: activeAddress.id,
      loyaltyPoints: effectiveLoyaltyPoints,
    });

    if (
      !idempotencyRef.current ||
      idempotencyRef.current.signature !== signature
    ) {
      idempotencyRef.current = {
        signature,
        key: crypto.randomUUID(),
      };
    }

    const result = await checkoutCodAction({
      idempotencyKey: idempotencyRef.current.key,
      items: payloadItems,
      addressId: activeAddress.id,
      loyaltyPoints: effectiveLoyaltyPoints,
      clientTotalVnd: displayTotalVnd,
    });

    setIsSubmitting(false);

    if (!result.ok) {
      if (result.sessionInvalidated) {
        clearSession();
        router.replace("/login?redirect=/checkout");
        return;
      }
      setSubmitError(result.message);
      return;
    }

    idempotencyRef.current = null;
    clearCart();
    setConfirmedOrder(result.order);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6 lg:py-8">
      <div className="flex flex-col gap-2 border-b border-border-subtle pb-4">
        <div>
          <Link
            href="/cart"
            className={buttonVariants({
              variant: "ghost",
              size: "sm",
              className: "-ml-2 gap-1.5 text-gray-600 hover:text-gray-900",
            })}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>Quay lại giỏ hàng</span>
          </Link>
        </div>

        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">
          Thanh toán đơn hàng
        </h1>
      </div>

      {activeError ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertDescription>{activeError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          {/* Delivery Address Section */}
          <section className="space-y-3 border-b border-border-subtle pb-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
                <MapPin
                  className="size-4 text-brand-forest"
                  aria-hidden="true"
                />
                Địa chỉ giao hàng
              </h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddressDialogOpen(true)}
                className="gap-1.5 text-xs font-semibold"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                Thêm địa chỉ mới
              </Button>
            </div>

            {!isAddressesHydrated ? (
              <div
                className="space-y-2 rounded-lg border border-border-subtle p-3"
                aria-busy="true"
                aria-label="Đang tải địa chỉ giao hàng"
              >
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3.5 w-72" />
              </div>
            ) : addresses.length === 0 ? (
              <Alert>
                <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Bạn chưa có địa chỉ giao hàng. Vui lòng thêm địa chỉ để tính
                    phí giao xe lạnh.
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setAddressDialogOpen(true)}
                    className="bg-brand-forest text-white hover:bg-brand-dark"
                  >
                    Thêm địa chỉ ngay
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <RadioGroup
                value={activeAddress?.id ?? ""}
                onValueChange={(value) => {
                  setSubmitError(null);
                  selectSavedAddress(String(value));
                }}
                className="space-y-2"
              >
                {addresses.map((addr) => {
                  const radioId = `checkout-address-${addr.id}`;
                  return (
                    <div
                      key={addr.id}
                      className="flex items-start gap-3 rounded-lg border border-border-subtle p-3 hover:border-brand-forest"
                    >
                      <RadioGroupItem
                        id={radioId}
                        value={addr.id}
                        className="mt-0.5"
                      />
                      <Label
                        htmlFor={radioId}
                        className="min-w-0 flex-1 cursor-pointer flex-col items-start gap-0.5"
                      >
                        <span className="text-sm font-bold text-gray-900">
                          {addr.receiverName} — {addr.phoneNumber}
                        </span>
                        <span className="text-xs font-normal text-gray-600">
                          {addr.streetAddress}, {addr.district}, {addr.city}
                        </span>
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            )}

            {activeAddress ? (
              <DeliveryQuoteSummary
                districtName={activeAddress.district}
                quote={validation?.shipping ?? null}
                isLoading={isValidating}
                errorMessage={validationError}
                onRetry={retryValidation}
              />
            ) : null}
          </section>

          {/* Loyalty Points Section */}
          <section className="space-y-3 border-b border-border-subtle pb-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-gray-900">
                Điểm thưởng GreenRoots
              </h2>
              <span className="text-xs font-semibold text-brand-dark tabular-nums">
                Khả dụng: {availableLoyaltyPoints.toLocaleString("vi-VN")} điểm
              </span>
            </div>

            {availableLoyaltyPoints > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="checkout-use-max-loyalty"
                    checked={useMaxLoyalty}
                    onCheckedChange={(checked) => {
                      setSubmitError(null);
                      const next = Boolean(checked);
                      setUseMaxLoyalty(next);
                      if (next) {
                        setRequestedLoyaltyInput(
                          clampLoyaltyPoints(
                            availableLoyaltyPoints,
                            availableLoyaltyPoints,
                            effectiveSubtotalVnd,
                          ),
                        );
                      } else {
                        setRequestedLoyaltyInput(0);
                      }
                    }}
                  />
                  <Label
                    htmlFor="checkout-use-max-loyalty"
                    className="cursor-pointer text-sm font-normal"
                  >
                    <span>
                      Dùng tối đa{" "}
                      <strong className="tabular-nums">
                        {clampLoyaltyPoints(
                          availableLoyaltyPoints,
                          availableLoyaltyPoints,
                          effectiveSubtotalVnd,
                        ).toLocaleString("vi-VN")}
                      </strong>{" "}
                      điểm (1 điểm = 1đ tiền hàng)
                    </span>
                  </Label>
                </div>

                {!useMaxLoyalty ? (
                  <div className="flex items-center gap-3">
                    <Label
                      htmlFor="loyalty-points-input"
                      className="text-xs text-gray-600"
                    >
                      Hoặc nhập số điểm muốn dùng:
                    </Label>
                    <Input
                      id="loyalty-points-input"
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={
                        requestedLoyaltyInput > 0
                          ? requestedLoyaltyInput.toLocaleString("vi-VN")
                          : ""
                      }
                      onChange={(e) => {
                        setSubmitError(null);
                        const digits = e.target.value.replace(/\D/g, "");
                        if (digits === "") {
                          setRequestedLoyaltyInput(0);
                          return;
                        }
                        const parsed = Number.parseInt(digits, 10);
                        setRequestedLoyaltyInput(
                          clampLoyaltyPoints(
                            parsed,
                            availableLoyaltyPoints,
                            effectiveSubtotalVnd,
                          ),
                        );
                      }}
                      className="h-9 w-36 tabular-nums"
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-gray-500">
                Bạn chưa có điểm thưởng khả dụng cho đơn hàng này.
              </p>
            )}
          </section>

          {/* Payment Method (COD only in #141) */}
          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">
              Phương thức thanh toán
            </h2>
            <div className="flex items-center gap-3 rounded-lg border border-brand-forest bg-green-50/50 p-3.5">
              <Banknote
                className="size-5 shrink-0 text-brand-forest"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-bold text-gray-900">
                  Thanh toán khi nhận hàng (COD)
                </p>
                <p className="text-xs text-gray-600">
                  Kiểm tra độ tươi và mã truy xuất nguồn gốc trước khi thanh
                  toán tiền mặt.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Order Summary */}
        <aside className="flex flex-col gap-4 border-t border-border-subtle pt-6 lg:sticky lg:top-20 lg:col-span-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <h2 className="text-lg font-bold text-gray-900">Tóm tắt đơn hàng</h2>

          <ul className="divide-y divide-border-subtle border-b border-border-subtle pb-3 text-xs">
            {items.map((item) => (
              <li
                key={item.productId}
                className="flex items-center justify-between gap-2 py-2"
              >
                <span className="text-gray-700">
                  {item.name} × {roundQuantity(item.quantity)}
                </span>
                <span className="font-semibold text-gray-900 tabular-nums">
                  {formatVnd(item.unitPriceVnd * item.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <div className="space-y-2 border-b border-border-subtle pb-4 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Tạm tính tiền hàng</span>
              <span className="font-semibold text-gray-900 tabular-nums">
                {formatVnd(effectiveSubtotalVnd)}
              </span>
            </div>
            {discountVnd > 0 ? (
              <div className="flex justify-between">
                <span className="text-gray-600">Giảm giá điểm thưởng</span>
                <span className="font-semibold text-brand-dark tabular-nums">
                  -{formatVnd(discountVnd)}
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Phí giao xe lạnh</span>
              {isValidating ? (
                <Skeleton className="h-4 w-20" />
              ) : (
                <span className="font-semibold text-gray-900 tabular-nums">
                  {validation?.shipping
                    ? shippingFeeVnd === 0
                      ? "Miễn phí"
                      : formatVnd(shippingFeeVnd)
                    : "Chờ chọn địa chỉ"}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-baseline justify-between">
            <span className="text-base font-bold text-gray-900">
              Tổng thanh toán
            </span>
            {isValidating ? (
              <Skeleton className="h-6 w-28" />
            ) : (
              <span className="text-xl font-extrabold text-brand-forest tabular-nums">
                {formatVnd(displayTotalVnd)}
              </span>
            )}
          </div>

          {!meetsMov ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" aria-hidden="true" />
              <AlertDescription>
                Đơn hàng chưa đạt mức tối thiểu{" "}
                {formatVnd(BUSINESS_RULES.MIN_ORDER_VALUE_VND)}.{" "}
                <Link href="/cart" className="underline">
                  Quay lại giỏ hàng
                </Link>
              </AlertDescription>
            </Alert>
          ) : null}

          {hasStockIssues ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" aria-hidden="true" />
              <AlertDescription>
                Một số sản phẩm trong giỏ đã hết hàng hoặc vượt quá tồn kho khả
                dụng.{" "}
                <Link href="/cart" className="underline">
                  Quay lại giỏ hàng để điều chỉnh
                </Link>
              </AlertDescription>
            </Alert>
          ) : null}

          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => void handlePlaceOrder()}
            className="h-11 w-full bg-brand-forest font-bold text-white hover:bg-brand-dark"
          >
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Đang đặt hàng...
              </span>
            ) : (
              `Đặt hàng COD — ${formatVnd(displayTotalVnd)}`
            )}
          </Button>
        </aside>
      </div>

      <AddressDialog
        open={addressDialogOpen}
        onOpenChange={setAddressDialogOpen}
      />
    </div>
  );
}
