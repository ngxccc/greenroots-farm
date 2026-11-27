import type { Metadata } from "next";
import { forbidden, notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  OrderDetailDegradedView,
  OrderDetailSkeleton,
  OrderDetailView,
} from "@/features/orders/components/order-detail-view";
import { resolveCustomerOrderDetailSession } from "@/features/orders/services/orders.server";

export const metadata: Metadata = {
  title: "Chi tiết đơn hàng",
  description:
    "Xem tiến trình trạng thái, sản phẩm, địa chỉ nhận hàng và chi tiết thanh toán đơn hàng GreenRoots Farm.",
};

interface OrderDetailPageProps {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<{ readonly payment?: string }>;
}

async function OrderDetailGate({ params, searchParams }: OrderDetailPageProps) {
  // Force per-request dynamic execution before uncached params/session reads under cacheComponents.
  await connection();
  const [{ id }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const paymentQuery =
    typeof resolvedSearchParams.payment === "string"
      ? resolvedSearchParams.payment
      : undefined;

  const resolution = await resolveCustomerOrderDetailSession(id);

  if (resolution.status === "not_found") {
    notFound();
  }

  if (resolution.status === "unauthenticated") {
    redirect(`/login?redirect=${encodeURIComponent(`/orders/${id}`)}`);
  }

  if (resolution.status === "forbidden") {
    forbidden();
  }

  if (resolution.status === "degraded") {
    return <OrderDetailDegradedView />;
  }

  return (
    <OrderDetailView
      order={resolution.order}
      initialPaymentQuery={paymentQuery}
    />
  );
}

/**
 * Authenticated customer order detail route (`/orders/[id]`, SF-05).
 */
export default function OrderDetailPage({
  params,
  searchParams,
}: OrderDetailPageProps) {
  return (
    <Suspense fallback={<OrderDetailSkeleton />}>
      <OrderDetailGate params={params} searchParams={searchParams} />
    </Suspense>
  );
}
