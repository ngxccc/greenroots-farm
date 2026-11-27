import type { Metadata } from "next";
import { forbidden, notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { OrderDetailDegradedView } from "@/features/orders/components/order-detail-view";
import {
  OrderComplaintSkeleton,
  OrderComplaintView,
} from "@/features/orders/components/order-complaint-view";
import { resolveCustomerOrderComplaintSession } from "@/features/orders/services/orders.server";

export const metadata: Metadata = {
  title: "Khiếu nại đơn hàng",
  description:
    "Gửi khiếu nại và theo dõi trạng thái xử lý đơn hàng trong 24 giờ sau khi nhận hàng tại GreenRoots Farm.",
};

interface OrderComplaintPageProps {
  readonly params: Promise<{ readonly id: string }>;
}

async function OrderComplaintGate({ params }: OrderComplaintPageProps) {
  await connection();
  const { id } = await params;

  const resolution = await resolveCustomerOrderComplaintSession(id);

  if (resolution.status === "not_found") {
    notFound();
  }

  if (resolution.status === "unauthenticated") {
    redirect(
      `/login?redirect=${encodeURIComponent(`/orders/${id}/complaint`)}`,
    );
  }

  if (resolution.status === "forbidden") {
    forbidden();
  }

  if (resolution.status === "degraded") {
    return <OrderDetailDegradedView />;
  }

  return (
    <OrderComplaintView
      order={resolution.order}
      initialComplaint={resolution.complaint}
    />
  );
}

/**
 * Authenticated customer post-delivery complaint route (`/orders/[id]/complaint`, SF-05).
 */
export default function OrderComplaintPage({
  params,
}: OrderComplaintPageProps) {
  return (
    <Suspense fallback={<OrderComplaintSkeleton />}>
      <OrderComplaintGate params={params} />
    </Suspense>
  );
}
