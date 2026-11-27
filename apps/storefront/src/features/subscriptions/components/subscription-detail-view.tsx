"use client";

import { useState } from "react";
import { DELIVERY_DAY_LABELS, SubscriptionStatus } from "@greenroots/shared";
import { Badge, Skeleton } from "@greenroots/ui";
import { BackLink } from "@/components/common/back-link";
import { AccountProfileDegradedCard } from "@/features/account/components/account-profile-view";
import { formatViDate, formatViDateTime, formatVnd } from "@/lib/format";
import type { SubscriptionDto } from "../schemas/subscription.schema";
import {
  computeSubscriptionShippingTotalVnd,
  SUBSCRIPTION_STATUS_LABELS,
} from "../utils/subscription-payos.utils";
import { SubscriptionPayosPanel } from "./subscription-payos-panel";

interface SubscriptionDetailViewProps {
  readonly subscription: SubscriptionDto;
  readonly initialPaymentQuery?: string;
}

/**
 * Customer subscription detail view (`/subscriptions/[id]`, SF-04) rendering
 * live PayOS status, plan summary, delivery schedule, receiver snapshot, and cost breakdown.
 */
export function SubscriptionDetailView({
  subscription: initialSubscription,
  initialPaymentQuery,
}: SubscriptionDetailViewProps) {
  const [subscription, setSubscription] = useState(initialSubscription);
  const shippingTotalVnd = computeSubscriptionShippingTotalVnd(subscription);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pt-4 pb-8 lg:px-6 lg:pt-5 lg:pb-10">
      <div className="flex flex-col gap-2 border-b border-border-subtle pb-5">
        <BackLink href="/subscriptions" />

        <section
          aria-label="Thông tin chung gói rau định kỳ"
          className="flex flex-col justify-between gap-4 md:flex-row md:items-center"
        >
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 tabular-nums">
                {subscription.subscriptionCode}
              </h1>
              <Badge
                variant={
                  subscription.status === SubscriptionStatus.CANCELLED
                    ? "destructive"
                    : "default"
                }
              >
                {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
              </Badge>
              <Badge variant="outline">
                {DELIVERY_DAY_LABELS[subscription.deliveryDay]}
              </Badge>
            </div>
            <p className="text-xs text-gray-500 tabular-nums">
              Đăng ký lúc {formatViDateTime(subscription.createdAt)} — Cập nhật{" "}
              {formatViDateTime(subscription.updatedAt)}
            </p>
          </div>
        </section>
      </div>

      <SubscriptionPayosPanel
        subscription={subscription}
        initialPaymentQuery={initialPaymentQuery}
        onSubscriptionUpdated={setSubscription}
      />

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <section
          aria-label="Chi tiết gói rau và lịch giao"
          className="flex flex-col gap-4 lg:col-span-7"
        >
          <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
            <h2 className="text-base font-bold text-gray-900">
              Thông tin gói rau
            </h2>
            <span className="text-xs font-semibold text-brand-dark tabular-nums">
              {subscription.remainingDeliveries}/{subscription.totalDeliveries}{" "}
              chuyến còn lại
            </span>
          </div>

          <div className="space-y-2 border-b border-border-subtle pb-4">
            <p className="text-sm font-bold text-gray-900">
              {subscription.planName}
            </p>
            <p className="text-xs text-gray-600">
              {subscription.basketDescription}
            </p>
            <dl className="grid grid-cols-2 gap-3 pt-2 text-xs">
              <div>
                <dt className="text-gray-500">Định lượng mỗi chuyến</dt>
                <dd className="font-semibold text-gray-900 tabular-nums">
                  {subscription.weightPerDeliveryKg} kg/chuyến
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Lịch giao cố định</dt>
                <dd className="font-semibold text-gray-900">
                  {DELIVERY_DAY_LABELS[subscription.deliveryDay]}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Ngày bắt đầu</dt>
                <dd className="font-semibold text-gray-900 tabular-nums">
                  {formatViDate(subscription.startDate)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Ngày kết thúc dự kiến</dt>
                <dd className="font-semibold text-gray-900 tabular-nums">
                  {formatViDate(subscription.endDate)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-gray-900">
              Địa chỉ nhận hàng
            </h3>
            <p className="text-xs font-semibold text-gray-900">
              {subscription.receiverName} —{" "}
              <span className="tabular-nums">{subscription.receiverPhone}</span>
            </p>
            <p className="text-xs text-gray-600">
              {subscription.shippingAddress}
            </p>
            <p className="text-[11px] text-gray-500 tabular-nums">
              Khoảng cách ước tính: {subscription.shippingDistanceKm.toFixed(1)}{" "}
              km
            </p>
          </div>
        </section>

        <section
          aria-label="Tổng quan thanh toán gói rau"
          className="flex flex-col gap-3 border-t border-border-subtle pt-5 lg:col-span-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8"
        >
          <h2 className="border-b border-border-subtle pb-2.5 text-base font-bold text-gray-900">
            Chi tiết thanh toán
          </h2>
          <dl className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-600">
                Giá gói ({subscription.totalDeliveries} chuyến)
              </dt>
              <dd className="font-semibold text-gray-900 tabular-nums">
                {formatVnd(subscription.priceVnd)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-gray-600">
                Phí giao hàng ({subscription.totalDeliveries} chuyến)
              </dt>
              <dd className="font-semibold text-gray-900 tabular-nums">
                {shippingTotalVnd === 0
                  ? "Miễn phí"
                  : formatVnd(shippingTotalVnd)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-3 text-sm">
              <dt className="font-bold text-gray-900">Tổng thanh toán</dt>
              <dd className="text-base font-extrabold text-brand-forest tabular-nums">
                {formatVnd(subscription.totalAmountVnd)}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

/**
 * Suspense skeleton fallback for `/subscriptions/[id]`.
 */
export function SubscriptionDetailSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pt-4 pb-8 lg:px-6 lg:pt-5 lg:pb-10">
      <div className="space-y-3 border-b border-border-subtle pb-5">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-28 w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <Skeleton className="h-48 w-full rounded-lg lg:col-span-7" />
        <Skeleton className="h-40 w-full rounded-lg lg:col-span-5" />
      </div>
    </div>
  );
}

/**
 * Degraded fallback rendered when the subscription detail API is unavailable.
 */
export function SubscriptionDetailDegradedView() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 pt-4 pb-8 lg:px-6 lg:pt-5 lg:pb-10">
      <BackLink href="/subscriptions" />
      <AccountProfileDegradedCard />
    </div>
  );
}
