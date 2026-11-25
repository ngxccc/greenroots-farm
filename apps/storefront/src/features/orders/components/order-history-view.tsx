"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { OrderStatus, PaymentMethod } from "@greenroots/shared";
import { Badge, Button, Skeleton, buttonVariants } from "@greenroots/ui";
import { ChevronLeft, ChevronRight, Package, Sprout } from "lucide-react";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/constants/domain-labels.constant";
import { AccountProfileDegradedCard } from "@/features/account/components/account-profile-view";
import { formatViDateTime, formatVnd } from "@/lib/format";
import type { OrderDto } from "../schemas/order.schema";
import type { PaginationMetaDto } from "../services/orders.server";
import {
  ORDER_HISTORY_TABS,
  type OrderHistoryTabKey,
  buildOrderHistoryHref,
  canReorderOrder,
  summarizeOrderItems,
} from "../utils/order-history.utils";
import { ReorderButton } from "./reorder-button";

interface OrderHistoryViewProps {
  readonly orders: readonly OrderDto[];
  readonly meta: PaginationMetaDto;
  readonly activeTab: OrderHistoryTabKey;
}

function resolveStatusBadgeVariant(
  status: OrderDto["orderStatus"],
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case OrderStatus.CANCELLED:
      return "destructive";
    case OrderStatus.DELIVERED:
    case OrderStatus.COMPLETED:
      return "default";
    case OrderStatus.SHIPPING:
      return "secondary";
    default:
      return "outline";
  }
}

/**
 * Paginated customer order history view rendered inside `/account/orders` (`AccountLayout`).
 */
export function OrderHistoryView({
  orders,
  meta,
  activeTab,
}: OrderHistoryViewProps) {
  const router = useRouter();

  function handleSelectTab(tab: OrderHistoryTabKey) {
    router.push(buildOrderHistoryHref(tab, 1));
  }

  function handlePageChange(nextPage: number) {
    router.push(buildOrderHistoryHref(activeTab, nextPage));
  }

  return (
    <section aria-label="Đơn hàng của tôi" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">Đơn hàng của tôi</h1>
        <span className="text-sm font-semibold text-brand-dark tabular-nums">
          {meta.total} đơn hàng
        </span>
      </div>

      {/* Neutral 5-tab status filter bar (UI-1) */}
      <div
        role="group"
        aria-label="Lọc theo trạng thái đơn hàng"
        className="flex flex-wrap items-center gap-1.5 border-b border-border-subtle pb-3"
      >
        {ORDER_HISTORY_TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <Button
              key={tab.key}
              type="button"
              variant={isActive ? "default" : "outline"}
              size="sm"
              aria-pressed={isActive}
              onClick={() => handleSelectTab(tab.key)}
              className={
                isActive
                  ? "h-8 cursor-pointer rounded-full border-gray-900 bg-gray-900 px-3.5 text-xs font-semibold text-white hover:bg-gray-800 hover:text-white"
                  : "h-8 cursor-pointer rounded-full border-border-subtle bg-surface-card px-3.5 text-xs font-medium text-gray-800 hover:bg-gray-100 hover:text-gray-900"
              }
            >
              {tab.label}
            </Button>
          );
        })}
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl bg-surface-warm px-6 py-12 text-center">
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-full bg-green-50 text-brand-forest"
          >
            <Package className="size-7" />
          </span>
          <div className="max-w-md space-y-1">
            <h2 className="text-base font-bold text-gray-900">
              Chưa có đơn hàng nào
            </h2>
            <p className="text-sm text-pretty text-gray-600">
              Không có đơn hàng nào ở trạng thái này. Khám phá rau củ hữu cơ thu
              hoạch lúc 4h sáng để đặt đơn ngay nhé.
            </p>
          </div>
          <Link
            href="/products"
            className={buttonVariants({
              className:
                "gap-2 bg-brand-forest font-semibold text-white hover:bg-brand-dark",
            })}
          >
            <Sprout className="size-4" aria-hidden="true" />
            <span>Đặt rau tươi ngay</span>
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-border-subtle border-t border-border-subtle">
          {orders.map((order) => {
            const isSubscription =
              order.paymentMethod === PaymentMethod.SUBSCRIPTION;

            return (
              <article key={order.id} className="flex flex-col gap-3 py-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/orders/${order.id}`}
                      className="text-sm font-bold text-gray-900 tabular-nums hover:text-brand-forest hover:underline"
                    >
                      {order.orderCode}
                    </Link>
                    <Badge variant="outline" className="text-[11px]">
                      {isSubscription
                        ? "Đơn định kỳ"
                        : PAYMENT_METHOD_LABELS[order.paymentMethod]}
                    </Badge>
                    <span className="text-xs text-gray-500 tabular-nums">
                      {formatViDateTime(order.createdAt)}
                    </span>
                  </div>

                  <Badge variant={resolveStatusBadgeVariant(order.orderStatus)}>
                    {ORDER_STATUS_LABELS[order.orderStatus]}
                  </Badge>
                </div>

                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {summarizeOrderItems(order.items)}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {order.receiverName} — {order.shippingAddress}
                    </p>
                  </div>
                  <span className="shrink-0 text-base font-bold text-brand-dark tabular-nums">
                    {formatVnd(order.totalAmountVnd)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  {canReorderOrder(order) ? (
                    <ReorderButton order={order} />
                  ) : null}
                  <Link
                    href={`/orders/${order.id}`}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    Xem chi tiết
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {meta.totalPages > 1 ? (
        <div className="flex flex-col justify-between gap-3 border-t border-border-subtle pt-4 sm:flex-row sm:items-center">
          <span className="text-xs text-gray-500 tabular-nums">
            Trang {meta.page} / {meta.totalPages} — Tổng {meta.total} đơn hàng
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!meta.hasPrevPage}
              onClick={() => handlePageChange(meta.page - 1)}
              aria-label="Trang trước"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              <span>Trước</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!meta.hasNextPage}
              onClick={() => handlePageChange(meta.page + 1)}
              aria-label="Trang sau"
            >
              <span>Sau</span>
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Degraded recovery view when `/account/orders` fails to reach the API.
 */
export function OrderHistoryDegradedView() {
  const router = useRouter();

  return (
    <AccountProfileDegradedCard
      title="Không thể tải danh sách đơn hàng lúc này"
      description="Kết nối tới máy chủ GreenRoots Farm đang tạm gián đoạn. Vui lòng thử tải lại sau ít giây."
      onRetry={() => router.refresh()}
    />
  );
}

/**
 * Streaming `<Suspense>` skeleton for `/account/orders`.
 */
export function OrderHistorySkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-16 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
      <div className="space-y-4 border-t border-border-subtle pt-4">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </div>
  );
}
