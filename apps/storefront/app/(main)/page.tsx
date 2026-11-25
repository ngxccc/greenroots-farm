import { connection } from "next/server";
import { Suspense } from "react";
import { Skeleton } from "@greenroots/ui";
import { HomeView } from "@/features/home/components/home-view";
import { ProductGridSkeleton } from "@/features/home/components/product-card";
import { fetchLiveHomeCatalog } from "@/features/catalog/services/catalog.service";
import { fetchApiHealth } from "@/lib/health";

async function HomeContent() {
  await connection();
  const [{ reachable }, shelves] = await Promise.all([
    fetchApiHealth(),
    fetchLiveHomeCatalog(),
  ]);

  return <HomeView shelves={shelves} apiReachable={reachable} />;
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div
          aria-hidden="true"
          className="mx-auto max-w-6xl space-y-8 px-4 py-8 lg:px-6"
        >
          <Skeleton className="h-64 w-full rounded-2xl bg-green-100/70" />
          <ProductGridSkeleton count={5} columns={5} />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
