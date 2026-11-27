"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OrderStatus } from "@greenroots/shared";
import { Badge, Button, Skeleton } from "@greenroots/ui";
import { AlertTriangle, Leaf } from "lucide-react";
import { BackLink } from "@/components/common/back-link";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/constants/domain-labels.constant";
import { AccountProfileDegradedCard } from "@/features/account/components/account-profile-view";
import { formatViDateTime, formatVnd, roundQuantity } from "@/lib/format";
import { isApprovedStorefrontImageUrl } from "@/lib/image-url";
import type { OrderDto } from "../schemas/order.schema";
import {
  isComplaintWindowExpired,
  isOrderComplaintEligibleStatus,
} from "../utils/complaint.utils";
import {
  type OrderTimelineStep,
  buildOrderTimelineSteps,
  canReorderOrder,
} from "../utils/order-history.utils";
import { resolvePayosPanelPhase } from "../utils/payos-payment.utils";
import { ReorderButton } from "./reorder-button";
import { PayosPaymentPanel } from "./payos-payment-panel";

interface OrderDetailViewProps {
  readonly order: OrderDto;
  readonly initialPaymentQuery?: string;
}

function resolveStepToneClass(state: OrderTimelineStep["state"]): string {
  switch (state) {
    case "completed":
      return "text-brand-forest";
    case "current":
      return "text-brand-dark font-bold";
    case "cancelled":
      return "text-status-spoiled font-bold";
    case "upcoming":
      return "text-gray-400";
  }
}

function OrderItemThumbnail({
  src,
  alt,
}: {
  readonly src: string | null;
  readonly alt: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const approvedSrc =
    src !== null && isApprovedStorefrontImageUrl(src) ? src : null;
  const showFallback = !approvedSrc || failedSrc === approvedSrc;

  return (
    <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-green-50 text-brand-forest">
      {showFallback ? (
        <Leaf className="size-6" aria-hidden="true" />
      ) : (
        <Image
          src={approvedSrc}
          alt={alt}
          fill
          sizes="64px"
          onError={() => setFailedSrc(approvedSrc)}
          className="object-cover"
        />
      )}
    </div>
  );
}

/**
 * Customer order detail view (SF-05 `/orders/[id]`) rendering an honest `OrderDto`
 * timeline, immutable receiver/address snapshot, line items, and totals.
 */
export function OrderDetailView({
  order: initialOrder,
  initialPaymentQuery,
}: OrderDetailViewProps) {
  const [order, setOrder] = useState(initialOrder);
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setNowMs(Date.now());
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const timelineSteps = buildOrderTimelineSteps(
    order.orderStatus,
    order.createdAt,
    order.updatedAt,
  );
  const showComplaintEntry = isOrderComplaintEligibleStatus(order.orderStatus);
  const isComplaintExpired =
    nowMs !== null ? isComplaintWindowExpired(order.deliveredAt, nowMs) : false;
  // Avoid duplicating the reorder CTA when the inline PayOS expired/cancelled banner already renders it.
  const showHeaderReorder =
    canReorderOrder(order) && resolvePayosPanelPhase(order) !== "expired";

  const hasHeaderActions = showHeaderReorder || showComplaintEntry;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pt-4 pb-8 lg:px-6 lg:pt-5 lg:pb-10">
      <div className="flex flex-col gap-2 border-b border-border-subtle pb-5">
        <BackLink href="/account/orders" />

        {/* Order Summary Header */}
        <section
          aria-label="Thông tin chung đơn hàng"
          className="flex flex-col justify-between gap-4 md:flex-row md:items-center"
        >
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 tabular-nums">
                {order.orderCode}
              </h1>
              <Badge
                variant={
                  order.orderStatus === OrderStatus.CANCELLED
                    ? "destructive"
                    : "default"
                }
              >
                {ORDER_STATUS_LABELS[order.orderStatus]}
              </Badge>
              <Badge variant="outline">
                {PAYMENT_METHOD_LABELS[order.paymentMethod]}
              </Badge>
            </div>
            <p className="text-xs text-gray-500 tabular-nums">
              Đặt lúc {formatViDateTime(order.createdAt)} — Cập nhật{" "}
              {formatViDateTime(order.updatedAt)}
            </p>
          </div>

          {hasHeaderActions ? (
            <div className="flex flex-wrap items-center gap-2.5">
              {showHeaderReorder ? (
                <ReorderButton order={order} size="default" />
              ) : null}

              {showComplaintEntry ? (
                <Button
                  nativeButton={false}
                  variant="outline"
                  render={<Link href={`/orders/${order.id}/complaint`} />}
                  className="gap-1.5"
                >
                  <AlertTriangle
                    className="size-4 text-status-spoiled"
                    aria-hidden="true"
                  />
                  <span>
                    {isComplaintExpired
                      ? "Khiếu nại (đã quá 24h)"
                      : "Khiếu nại đơn hàng"}
                  </span>
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <PayosPaymentPanel
        order={order}
        initialPaymentQuery={initialPaymentQuery}
        onOrderUpdated={setOrder}
      />

      {/* Status Timeline */}
      <section
        aria-label="Tiến trình trạng thái đơn hàng"
        className="flex flex-col gap-3 border-b border-border-subtle pb-6"
      >
        <h2 className="text-base font-bold text-gray-900">
          Tiến trình đơn hàng
        </h2>

        <div
          className={
            timelineSteps.length === 2
              ? "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-border-subtle"
              : "grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-border-subtle"
          }
        >
          {timelineSteps.map((step) => (
            <div
              key={step.key}
              className="flex items-start gap-2 lg:px-4 lg:first:pl-0 lg:last:pr-0"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <div
                  className={`text-xs font-semibold ${resolveStepToneClass(step.state)}`}
                >
                  <span>{step.label}</span>
                </div>
                {step.timestamp ? (
                  <span className="text-[11px] text-gray-500 tabular-nums">
                    {formatViDateTime(step.timestamp)}
                  </span>
                ) : (
                  <span className="text-[11px] text-gray-400">
                    {step.state === "upcoming" ? "Chờ cập nhật" : "Đã qua bước"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2-Column Body */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* Left: Line Items */}
        <section
          aria-label="Sản phẩm trong đơn"
          className="flex flex-col gap-4 lg:col-span-8"
        >
          <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
            <h2 className="text-base font-bold text-gray-900">
              Sản phẩm trong đơn
            </h2>
            <span className="text-xs font-semibold text-brand-dark tabular-nums">
              {order.items.length} mặt hàng
            </span>
          </div>

          <div className="divide-y divide-border-subtle">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col justify-between gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
              >
                <div className="flex items-center gap-3.5">
                  <OrderItemThumbnail
                    src={item.productImageUrl}
                    alt={item.productName}
                  />
                  <div className="space-y-0.5">
                    <Link
                      href={`/products/${item.productSlug}`}
                      className="text-sm font-semibold text-gray-900 hover:text-brand-forest hover:underline"
                    >
                      {item.productName}
                    </Link>
                    <p className="text-xs text-gray-500 tabular-nums">
                      {item.unit} — Đơn giá {formatVnd(item.unitPriceVnd)} ×{" "}
                      {roundQuantity(item.quantity)}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-bold text-gray-900 tabular-nums">
                  {formatVnd(item.lineTotalVnd)}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Right: Receiver Snapshot + Payment Summary */}
        <aside className="flex flex-col divide-y divide-border-subtle lg:col-span-4 lg:border-l lg:border-border-subtle lg:pl-6">
          <section
            aria-label="Địa chỉ và người nhận"
            className="flex flex-col gap-2 pb-6"
          >
            <h2 className="text-sm font-bold text-gray-900">
              Địa chỉ &amp; Người nhận
            </h2>
            <p className="text-sm font-semibold text-gray-900">
              {order.receiverName}
            </p>
            <p className="text-xs text-gray-600 tabular-nums">
              {order.receiverPhone}
            </p>
            <p className="text-xs text-pretty text-gray-700">
              {order.shippingAddress}
            </p>
          </section>

          <section
            aria-label="Chi tiết thanh toán"
            className="flex flex-col gap-2.5 pt-6"
          >
            <h2 className="text-sm font-bold text-gray-900">
              Chi tiết thanh toán
            </h2>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-gray-600">Tạm tính sản phẩm</span>
                <span className="font-medium text-gray-900 tabular-nums">
                  {formatVnd(order.subtotalVnd)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-600">
                  Phí giao xe lạnh ({order.shippingDistanceKm} km)
                </span>
                <span className="font-medium text-gray-900 tabular-nums">
                  {order.shippingFeeVnd === 0
                    ? "Miễn phí"
                    : formatVnd(order.shippingFeeVnd)}
                </span>
              </div>
              {order.discountAmountVnd > 0 ? (
                <div className="flex justify-between gap-2 text-brand-dark">
                  <span>
                    Điểm đã trừ (
                    {order.loyaltyPointsUsed.toLocaleString("vi-VN")} điểm)
                  </span>
                  <span className="font-semibold tabular-nums">
                    -{formatVnd(order.discountAmountVnd)}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="flex items-baseline justify-between gap-2 border-t border-border-subtle pt-3">
              <span className="text-sm font-bold text-gray-900">
                Tổng thanh toán
              </span>
              <span className="text-xl font-extrabold text-brand-forest tabular-nums">
                {formatVnd(order.totalAmountVnd)}
              </span>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

/**
 * Degraded recovery view when `/orders/[id]` fails to reach the API.
 */
export function OrderDetailDegradedView() {
  const router = useRouter();

  return (
    <AccountProfileDegradedCard
      title="Không thể tải chi tiết đơn hàng lúc này"
      description="Kết nối tới máy chủ GreenRoots Farm đang tạm gián đoạn. Vui lòng thử tải lại sau ít giây."
      onRetry={() => router.refresh()}
    />
  );
}

/**
 * Streaming `<Suspense>` skeleton for `/orders/[id]`.
 */
export function OrderDetailSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pt-4 pb-8 lg:px-6 lg:pt-5 lg:pb-10"
      aria-busy="true"
    >
      <Skeleton className="h-4 w-44" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-20 w-full" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <Skeleton className="h-56 lg:col-span-8" />
        <Skeleton className="h-56 lg:col-span-4" />
      </div>
    </div>
  );
}
