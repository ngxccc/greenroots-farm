import type { Metadata } from "next";
import { forbidden, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  OrderHistoryDegradedView,
  OrderHistorySkeleton,
  OrderHistoryView,
} from "@/features/orders/components/order-history-view";
import { resolveCustomerOrdersSession } from "@/features/orders/services/orders.server";
import {
  buildOrderHistoryHref,
  parseOrderHistorySearchParams,
} from "@/features/orders/utils/order-history.utils";

export const metadata: Metadata = {
  title: "Đơn hàng của tôi",
  description:
    "Theo dõi lịch sử đơn hàng, lọc theo trạng thái và xem chi tiết từng đơn hàng tại GreenRoots Farm.",
};

interface AccountOrdersPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function AccountOrdersGate({ searchParams }: AccountOrdersPageProps) {
  // Force per-request dynamic execution before uncached searchParams/session reads under cacheComponents.
  await connection();
  const resolvedParams = await searchParams;
  const { tab, page } = parseOrderHistorySearchParams(resolvedParams);

  const resolution = await resolveCustomerOrdersSession({ tab, page });

  if (resolution.status === "unauthenticated") {
    const target = buildOrderHistoryHref(tab, page);
    redirect(`/login?redirect=${encodeURIComponent(target)}`);
  }

  if (resolution.status === "forbidden") {
    forbidden();
  }

  if (resolution.status === "degraded") {
    return <OrderHistoryDegradedView />;
  }

  return (
    <OrderHistoryView
      orders={resolution.orders}
      meta={resolution.meta}
      activeTab={tab}
    />
  );
}

/**
 * Authenticated customer paginated order history route (`/account/orders`).
 */
export default function AccountOrdersPage({
  searchParams,
}: AccountOrdersPageProps) {
  return (
    <Suspense fallback={<OrderHistorySkeleton />}>
      <AccountOrdersGate searchParams={searchParams} />
    </Suspense>
  );
}
