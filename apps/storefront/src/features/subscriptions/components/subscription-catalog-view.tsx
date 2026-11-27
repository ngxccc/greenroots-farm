"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Skeleton,
  buttonVariants,
} from "@greenroots/ui";
import { BackLink } from "@/components/common/back-link";
import {
  API_ERROR_CODES,
  BUSINESS_RULES,
  DELIVERY_DAY_LABELS,
  DeliveryDay,
  UserRole,
} from "@greenroots/shared";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Circle,
  Loader2,
  QrCode,
  Sprout,
  Truck,
} from "lucide-react";
import { DeliveryQuoteSummary } from "@/components/common/delivery-quote-summary";
import { FARM_METADATA } from "@/constants/farm-metadata.constant";
import { listAddressesAction } from "@/features/account/actions/address-actions";
import { useShippingQuote } from "@/features/shipping/hooks/use-shipping-quote";
import { createSubscriptionCheckoutAction } from "@/features/subscriptions/actions/subscription-actions";
import {
  buildSubscriptionCheckoutSignature,
  calculateSubscriptionCheckoutTotals,
} from "@/features/subscriptions/utils/subscription-checkout.utils";
import {
  SUBSCRIPTION_DELIVERY_OPTIONS,
  SUBSCRIPTION_DELIVERY_TIME_WINDOW,
  formatSubscriptionDurationLabel,
} from "@/features/subscriptions/utils/subscription-plan.utils";
import { formatVnd } from "@/lib/format";
import { useAuthStore } from "@/stores/auth.store";
import {
  findActiveDeliveryAddress,
  useDeliveryAddressStore,
} from "@/stores/delivery-address.store";
import type { StorefrontSubscriptionPlan } from "@/types/subscription.types";

/**
 * Props for `SubscriptionCatalogView`.
 */
export interface SubscriptionCatalogViewProps {
  readonly plans: readonly StorefrontSubscriptionPlan[];
  readonly apiReachable: boolean;
}

/**
 * Extended props for `SubscriptionCheckoutView`, allowing injectable adapters in unit tests.
 */
export interface SubscriptionCheckoutViewProps extends SubscriptionCatalogViewProps {
  readonly onNavigate?: (href: string) => void;
  readonly createCheckoutFn?: typeof createSubscriptionCheckoutAction;
  readonly listAddressesFn?: typeof listAddressesAction;
}

/**
 * Testable SF-04 subscription plan catalog, delivery schedule selector,
 * active-address shipping quote (`isSubscription: true`), and inline PayOS checkout.
 *
 * @param props Active plans, API reachability, and optional navigation/action adapters.
 * @returns Flat, divider-driven subscription selection and checkout layout.
 */
export function SubscriptionCheckoutView({
  plans,
  apiReachable,
  onNavigate,
  createCheckoutFn = createSubscriptionCheckoutAction,
  listAddressesFn = listAddressesAction,
}: SubscriptionCheckoutViewProps) {
  const user = useAuthStore((state) => state.user);
  const isAuthHydrated = useAuthStore((state) => state.isHydrated);
  const clearSession = useAuthStore((state) => state.clearSession);

  const addresses = useDeliveryAddressStore((state) => state.addresses);
  const selectedAddressId = useDeliveryAddressStore(
    (state) => state.selectedAddressId,
  );
  const isAddressesHydrated = useDeliveryAddressStore(
    (state) => state.isHydrated,
  );
  const setAddresses = useDeliveryAddressStore((state) => state.setAddresses);

  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    () => plans[0]?.id ?? "",
  );
  const [selectedDeliveryDay, setSelectedDeliveryDay] = useState<DeliveryDay>(
    DeliveryDay.BOTH,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitErrorCode, setSubmitErrorCode] = useState<string | null>(null);

  const idempotencyRef = useRef<{ signature: string; key: string } | null>(
    null,
  );

  const isCustomer = user?.role === UserRole.CUSTOMER;
  const selectedPlan =
    plans.find((plan) => plan.id === selectedPlanId) ?? plans.at(0) ?? null;

  const activeAddress = useMemo(
    () => findActiveDeliveryAddress(addresses, selectedAddressId),
    [addresses, selectedAddressId],
  );

  // Hydrate saved addresses once per authenticated customer session.
  useEffect(() => {
    if (!isCustomer || isAddressesHydrated) {
      return;
    }

    let cancelled = false;
    void listAddressesFn().then((result) => {
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
  }, [
    clearSession,
    isAddressesHydrated,
    isCustomer,
    listAddressesFn,
    setAddresses,
  ]);

  // Quote strictly the single active address (`INV-SF04-3`) to avoid bursting all saved addresses.
  const {
    status: quoteStatus,
    quote,
    errorMessage: quoteErrorMessage,
    retry: retryQuote,
  } = useShippingQuote({
    enabled: isCustomer && Boolean(activeAddress?.id),
    addressId: activeAddress?.id ?? null,
    isSubscription: true,
    onSessionInvalidated: clearSession,
  });

  const totals = useMemo(() => {
    if (!selectedPlan) {
      return {
        isFreeShipping: false,
        shippingFeePerDeliveryVnd: null,
        totalShippingFeeVnd: null,
        totalAmountVnd: null,
      };
    }
    return calculateSubscriptionCheckoutTotals(selectedPlan, quote);
  }, [quote, selectedPlan]);

  const isDeliverable = quote?.isDeliverable ?? false;
  const canSubmit =
    isCustomer &&
    Boolean(selectedPlan) &&
    Boolean(activeAddress) &&
    quoteStatus === "success" &&
    isDeliverable &&
    !isSubmitting;

  async function handleCheckoutSubmit() {
    if (!selectedPlan || !activeAddress || !canSubmit) {
      return;
    }

    setSubmitError(null);
    setSubmitErrorCode(null);
    setIsSubmitting(true);

    const signature = buildSubscriptionCheckoutSignature({
      planId: selectedPlan.id,
      addressId: activeAddress.id,
      deliveryDay: selectedDeliveryDay,
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

    const result = await createCheckoutFn({
      idempotencyKey: idempotencyRef.current.key,
      planId: selectedPlan.id,
      addressId: activeAddress.id,
      deliveryDay: selectedDeliveryDay,
    });

    setIsSubmitting(false);

    if (!result.ok) {
      if (result.sessionInvalidated) {
        clearSession();
        onNavigate?.("/login?redirect=/subscriptions");
        return;
      }
      setSubmitError(result.message);
      setSubmitErrorCode(result.code);
      return;
    }

    idempotencyRef.current = null;
    onNavigate?.(`/subscriptions/${result.subscription.id}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6">
      <div className="flex flex-col gap-2 border-b border-border-subtle pb-4">
        <BackLink href="/" />

        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-bold tracking-tight text-gray-900 md:text-[28px]">
            Gói rau hữu cơ định kỳ
          </h1>
          <p className="max-w-prose text-[13px] text-pretty text-gray-600">
            Đặt trước theo chu kỳ để nhận rau cắt lúc{" "}
            {FARM_METADATA.harvestTimeLabel} đúng lịch cố định hàng tuần. Miễn
            phí vận chuyển trong bán kính{" "}
            {BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM} km từ{" "}
            {FARM_METADATA.hubName}.
          </p>
        </div>
      </div>

      {!selectedPlan ? (
        <Alert
          variant={apiReachable ? "default" : "destructive"}
          className="rounded-2xl border-border-subtle bg-surface-card p-5"
        >
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle className="font-bold text-gray-900">
            {apiReachable
              ? "Hiện chưa có gói rau định kỳ đang mở bán"
              : "Không thể kết nối tới hệ thống cửa hàng"}
          </AlertTitle>
          <AlertDescription className="text-gray-600">
            {apiReachable
              ? "Danh sách gói rau định kỳ đang được cập nhật. Bạn có thể quay lại trang chủ để xem nông sản tươi trong ngày."
              : "Dữ liệu gói rau định kỳ trực tiếp hiện chưa sẵn sàng. Vui lòng thử tải lại trang sau ít phút."}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <section
            aria-label="So sánh các gói rau định kỳ"
            className="flex flex-col gap-4 border-b border-border-subtle pb-6"
          >
            <div className="flex items-center gap-2">
              <Sprout className="size-5 text-brand-forest" aria-hidden="true" />
              <h2 className="text-lg font-bold text-gray-900">
                Chọn gói rau phù hợp
              </h2>
            </div>

            <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3">
              {plans.map((plan) => {
                const isSelected = plan.id === selectedPlan.id;
                const durationLabel = formatSubscriptionDurationLabel(
                  plan.totalDeliveries,
                  selectedDeliveryDay,
                );

                return (
                  <Button
                    key={plan.id}
                    type="button"
                    variant="ghost"
                    data-plan-id={plan.id}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSubmitError(null);
                      setSubmitErrorCode(null);
                      setSelectedPlanId(plan.id);
                    }}
                    className={`flex h-auto w-full flex-col items-stretch justify-between gap-4 rounded-xl p-6 text-left whitespace-normal transition-colors focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none ${
                      isSelected
                        ? "border-2 border-brand-forest bg-green-50 hover:bg-green-50"
                        : "border border-border-subtle bg-surface-card hover:border-brand-forest hover:bg-surface-card"
                    }`}
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[15px] font-semibold ${
                            isSelected ? "text-brand-dark" : "text-gray-900"
                          }`}
                        >
                          {plan.name}
                        </span>
                        <Badge
                          className={`border-0 tabular-nums ${
                            isSelected
                              ? "bg-brand-forest text-white"
                              : "bg-green-50 text-brand-dark"
                          }`}
                        >
                          {plan.totalDeliveries} chuyến ·{" "}
                          {plan.weightPerDeliveryKg} kg/chuyến
                        </Badge>
                      </div>

                      <div className="flex items-baseline gap-1.5">
                        <span
                          className={`text-[22px] font-bold tabular-nums ${
                            isSelected ? "text-brand-dark" : "text-gray-900"
                          }`}
                        >
                          {formatVnd(plan.priceVnd)}
                        </span>
                        <span className="text-[13px] text-gray-500 tabular-nums">
                          / {plan.totalDeliveries} chuyến
                        </span>
                      </div>

                      <p className="text-[13px] font-medium text-gray-800 tabular-nums">
                        {plan.basketDescription} ({formatVnd(plan.unitPriceVnd)}
                        /chuyến)
                      </p>
                      <p className="text-[13px] text-gray-600">
                        {plan.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-border-subtle pt-3">
                      <span className="text-xs font-semibold text-brand-dark tabular-nums">
                        {durationLabel}
                      </span>
                      {isSelected ? (
                        <CheckCircle2
                          className="size-5 shrink-0 text-brand-forest"
                          aria-hidden="true"
                        />
                      ) : (
                        <Circle
                          className="size-5 shrink-0 text-gray-400"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </Button>
                );
              })}
            </div>
          </section>

          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
            <div className="flex flex-col gap-6 lg:col-span-7">
              <section
                aria-label="Chọn ngày giao cố định"
                className="flex flex-col gap-4 border-b border-border-subtle pb-6"
              >
                <div className="flex items-center gap-2">
                  <Calendar
                    className="size-5 text-brand-forest"
                    aria-hidden="true"
                  />
                  <h2 className="text-lg font-bold text-gray-900">
                    Chọn ngày giao cố định
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {SUBSCRIPTION_DELIVERY_OPTIONS.map((option) => {
                    const isSelected = option.day === selectedDeliveryDay;
                    return (
                      <Button
                        key={option.day}
                        type="button"
                        variant="ghost"
                        data-delivery-day={option.day}
                        aria-pressed={isSelected}
                        onClick={() => {
                          setSubmitError(null);
                          setSubmitErrorCode(null);
                          setSelectedDeliveryDay(option.day);
                        }}
                        className={`h-auto w-full flex-col items-start justify-start rounded-xl p-4 text-left whitespace-normal transition-colors focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none ${
                          isSelected
                            ? "border-2 border-brand-forest bg-green-50 hover:bg-green-50"
                            : "border border-border-subtle bg-surface-card hover:border-brand-forest hover:bg-surface-card"
                        }`}
                      >
                        <span
                          className={`block text-[15px] font-semibold ${
                            isSelected ? "text-brand-dark" : "text-gray-900"
                          }`}
                        >
                          {option.label}
                        </span>
                        <span className="block text-[13px] text-gray-600 tabular-nums">
                          {option.timeWindow}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </section>

              {!isAuthHydrated ? (
                <div
                  className="space-y-2 rounded-xl border border-border-subtle p-4"
                  aria-busy="true"
                  aria-label="Đang kiểm tra trạng thái đăng nhập"
                >
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3.5 w-72" />
                </div>
              ) : !user ? (
                <Alert className="rounded-xl border-border-subtle bg-surface-card">
                  <AlertCircle className="size-4" aria-hidden="true" />
                  <AlertTitle className="font-semibold text-gray-900">
                    Đăng nhập để tính phí giao hàng và thanh toán
                  </AlertTitle>
                  <AlertDescription className="mt-1 flex flex-wrap items-center justify-between gap-3 text-gray-600">
                    <span>
                      Vui lòng đăng nhập tài khoản khách hàng để tính phí vận
                      chuyển theo địa chỉ đã chọn và thanh toán VietQR.
                    </span>
                    <Link
                      href="/login?redirect=/subscriptions"
                      className={buttonVariants({
                        size: "sm",
                        className:
                          "bg-brand-forest font-semibold text-white hover:bg-brand-dark",
                      })}
                    >
                      Đăng nhập ngay
                    </Link>
                  </AlertDescription>
                </Alert>
              ) : !isCustomer ? (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" aria-hidden="true" />
                  <AlertDescription>
                    Tài khoản quản trị/nhân viên không thể đăng ký gói rau trên
                    cửa hàng khách hàng. Vui lòng đăng nhập bằng tài khoản khách
                    hàng.
                  </AlertDescription>
                </Alert>
              ) : !isAddressesHydrated ? (
                <div
                  className="space-y-2 rounded-xl border border-border-subtle p-4"
                  aria-busy="true"
                  aria-label="Đang tải địa chỉ giao hàng"
                >
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3.5 w-72" />
                </div>
              ) : addresses.length === 0 || !activeAddress ? (
                <Alert>
                  <AlertCircle className="size-4" aria-hidden="true" />
                  <AlertDescription>
                    Chưa có địa chỉ giao hàng. Vui lòng chọn hoặc thêm địa chỉ ở
                    thanh điều hướng phía trên để tính phí giao gói rau định kỳ.
                  </AlertDescription>
                </Alert>
              ) : (
                <DeliveryQuoteSummary
                  districtName={activeAddress.ward}
                  quote={quote}
                  isLoading={quoteStatus === "loading"}
                  errorMessage={quoteErrorMessage}
                  onRetry={retryQuote}
                />
              )}

              {isCustomer &&
              activeAddress &&
              quoteStatus === "success" &&
              quote &&
              !quote.isDeliverable ? (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" aria-hidden="true" />
                  <AlertDescription>
                    Địa chỉ đã chọn nằm ngoài phạm vi giao hàng{" "}
                    {quote.maxRadiusKm} km từ nông trại. Vui lòng chọn địa chỉ
                    khác ở thanh điều hướng phía trên.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="flex items-start gap-2.5 text-[13px] text-gray-600">
                <Truck
                  className="mt-0.5 size-4 shrink-0 text-brand-forest"
                  aria-hidden="true"
                />
                <p className="tabular-nums">
                  Miễn phí giao hàng trong bán kính{" "}
                  {BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM} km từ{" "}
                  {FARM_METADATA.hubName}. Ngoài bán kính{" "}
                  {BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM} km (tối
                  đa {BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM} km), phí vận chuyển
                  được tính theo khoảng cách nhân với{" "}
                  {selectedPlan.totalDeliveries} chuyến giao.
                </p>
              </div>
            </div>

            <aside
              aria-label="Tóm tắt gói đăng ký"
              className="flex flex-col gap-4 border-t border-border-subtle pt-6 lg:sticky lg:top-20 lg:col-span-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8"
            >
              <h2 className="text-lg font-bold text-gray-900">
                Tóm tắt gói đăng ký
              </h2>

              <div className="flex flex-col gap-2 border-y border-border-subtle py-4 text-[13px]">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Gói đã chọn</span>
                  <span className="text-right font-semibold text-gray-900 tabular-nums">
                    {selectedPlan.name} ({selectedPlan.totalDeliveries} chuyến)
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Lịch giao</span>
                  <span className="text-right font-semibold text-gray-900 tabular-nums">
                    {DELIVERY_DAY_LABELS[selectedDeliveryDay]} (
                    {SUBSCRIPTION_DELIVERY_TIME_WINDOW})
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Thời lượng dự kiến</span>
                  <span className="text-right font-semibold text-brand-dark tabular-nums">
                    {formatSubscriptionDurationLabel(
                      selectedPlan.totalDeliveries,
                      selectedDeliveryDay,
                    )}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Định lượng mỗi chuyến</span>
                  <span className="text-right font-semibold text-gray-900 tabular-nums">
                    {selectedPlan.weightPerDeliveryKg} kg ·{" "}
                    {formatVnd(selectedPlan.unitPriceVnd)}/chuyến
                  </span>
                </div>
                <div className="flex justify-between gap-2 border-t border-border-subtle pt-2">
                  <span className="text-gray-500">Giá gói rau</span>
                  <span className="text-right font-semibold text-gray-900 tabular-nums">
                    {formatVnd(selectedPlan.priceVnd)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">
                    Phí giao hàng ({selectedPlan.totalDeliveries} chuyến)
                  </span>
                  <span className="text-right font-semibold text-gray-900 tabular-nums">
                    {!isCustomer || !activeAddress
                      ? "—"
                      : quoteStatus === "loading"
                        ? "Đang tính..."
                        : totals.totalShippingFeeVnd === null
                          ? "—"
                          : totals.isFreeShipping
                            ? "Miễn phí (0đ)"
                            : formatVnd(totals.totalShippingFeeVnd)}
                  </span>
                </div>
                {totals.totalShippingFeeVnd !== null &&
                !totals.isFreeShipping &&
                totals.shippingFeePerDeliveryVnd !== null ? (
                  <p className="text-right text-xs text-gray-500 tabular-nums">
                    {selectedPlan.totalDeliveries} chuyến ×{" "}
                    {formatVnd(totals.shippingFeePerDeliveryVnd)}/chuyến
                  </p>
                ) : null}
              </div>

              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold text-gray-900">
                  Tổng thanh toán
                </span>
                <span className="text-[22px] font-bold text-brand-forest tabular-nums">
                  {formatVnd(totals.totalAmountVnd ?? selectedPlan.priceVnd)}
                </span>
              </div>

              {submitError ? (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" aria-hidden="true" />
                  <AlertDescription>
                    {submitError}
                    {submitErrorCode ===
                    API_ERROR_CODES.SUBSCRIPTION_PENDING_LIMIT_REACHED ? (
                      <>
                        {" "}
                        <Link href="/account/orders" className="underline">
                          Xem đơn của tôi
                        </Link>
                      </>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}

              <Button
                type="button"
                data-testid="subscription-checkout-submit"
                disabled={!canSubmit}
                onClick={() => void handleCheckoutSubmit()}
                className="h-11 w-full gap-2 bg-brand-forest font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <QrCode className="size-4" aria-hidden="true" />
                )}
                <span>
                  {isSubmitting
                    ? "Đang tạo mã thanh toán VietQR..."
                    : "Thanh toán VietQR"}
                </span>
              </Button>

              <p className="text-xs text-gray-500">
                Gói rau định kỳ thanh toán trả trước qua VietQR (PayOS) và tự
                động giữ chỗ trong 15 phút.
              </p>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Interactive SF-04 subscription plan catalog and inline PayOS checkout route view.
 *
 * @param props Active plans from `GET /api/v1/subscription-plans` and API reachability status.
 * @returns Subscription catalog & checkout view wired to Next.js App Router navigation.
 */
export function SubscriptionCatalogView(props: SubscriptionCatalogViewProps) {
  const router = useRouter();
  return (
    <SubscriptionCheckoutView
      {...props}
      onNavigate={(href) => router.replace(href)}
    />
  );
}
