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
}

async function OrderDetailGate({ params }: OrderDetailPageProps) {
  // Force per-request dynamic execution before uncached params/session reads under cacheComponents.
  await connection();
  const { id } = await params;

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

  return <OrderDetailView order={resolution.order} />;
}

/**
 * Authenticated customer order detail route (`/orders/[id]`, SF-05).
 */
export default function OrderDetailPage({ params }: OrderDetailPageProps) {
  return (
    <Suspense fallback={<OrderDetailSkeleton />}>
      <OrderDetailGate params={params} />
    </Suspense>
  );
}
