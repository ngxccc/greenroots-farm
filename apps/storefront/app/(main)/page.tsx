import { connection } from "next/server";
import { Suspense } from "react";
import { Skeleton } from "@greenroots/ui";
import { HomeView } from "@/features/home/components/home-view";
import { ProductGridSkeleton } from "@/features/home/components/product-card";
import {
  fetchApiHealth,
  getShowcaseCatalog,
} from "@/services/storefront.service";

async function HomeContent() {
  await connection();
  const [{ reachable }, { products, plans }] = await Promise.all([
    fetchApiHealth(),
    Promise.resolve(getShowcaseCatalog()),
  ]);

  return (
    <HomeView products={products} plans={plans} apiReachable={reachable} />
  );
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
          <ProductGridSkeleton count={4} />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
