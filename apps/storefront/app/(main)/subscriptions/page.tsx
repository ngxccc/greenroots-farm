import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Skeleton } from "@greenroots/ui";
import { SubscriptionCatalogView } from "@/features/subscriptions/components/subscription-catalog-view";
import { fetchLiveSubscriptionPlans } from "@/services/subscription.service";

export const metadata: Metadata = {
  title: "Gói rau định kỳ",
};

async function SubscriptionsContent() {
  await connection();
  const { plans, apiReachable } = await fetchLiveSubscriptionPlans();

  return <SubscriptionCatalogView plans={plans} apiReachable={apiReachable} />;
}

export default function SubscriptionsPage() {
  return (
    <Suspense
      fallback={
        <div
          aria-hidden="true"
          className="mx-auto max-w-6xl space-y-6 px-4 py-8 lg:px-6"
        >
          <Skeleton className="h-20 w-full rounded-xl bg-green-100/70" />
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-56 w-full rounded-xl bg-green-100/70" />
            <Skeleton className="h-56 w-full rounded-xl bg-green-100/70" />
            <Skeleton className="h-56 w-full rounded-xl bg-green-100/70" />
          </div>
        </div>
      }
    >
      <SubscriptionsContent />
    </Suspense>
  );
}
