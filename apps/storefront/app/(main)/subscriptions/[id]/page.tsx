import type { Metadata } from "next";
import { forbidden, notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  SubscriptionDetailDegradedView,
  SubscriptionDetailSkeleton,
  SubscriptionDetailView,
} from "@/features/subscriptions/components/subscription-detail-view";
import { resolveCustomerSubscriptionDetailSession } from "@/features/subscriptions/services/subscriptions.server";

export const metadata: Metadata = {
  title: "Chi tiết gói rau định kỳ",
  description:
    "Theo dõi trạng thái thanh toán PayOS, lịch giao hàng và thông tin gói rau định kỳ GreenRoots Farm.",
};

interface SubscriptionDetailPageProps {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<{ readonly payment?: string }>;
}

async function SubscriptionDetailGate({
  params,
  searchParams,
}: SubscriptionDetailPageProps) {
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

  const resolution = await resolveCustomerSubscriptionDetailSession(id);

  if (resolution.status === "not_found") {
    notFound();
  }

  if (resolution.status === "unauthenticated") {
    redirect(`/login?redirect=${encodeURIComponent(`/subscriptions/${id}`)}`);
  }

  if (resolution.status === "forbidden") {
    forbidden();
  }

  if (resolution.status === "degraded") {
    return <SubscriptionDetailDegradedView />;
  }

  return (
    <SubscriptionDetailView
      subscription={resolution.subscription}
      initialPaymentQuery={paymentQuery}
    />
  );
}

/**
 * Authenticated customer subscription status and PayOS return route (`/subscriptions/[id]`, SF-04).
 */
export default function SubscriptionDetailPage({
  params,
  searchParams,
}: SubscriptionDetailPageProps) {
  return (
    <Suspense fallback={<SubscriptionDetailSkeleton />}>
      <SubscriptionDetailGate params={params} searchParams={searchParams} />
    </Suspense>
  );
}
