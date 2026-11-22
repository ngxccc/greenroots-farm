import { connection } from "next/server";
import { Suspense } from "react";
import { HomeView } from "@/features/home/components/home-view";
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
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-gray-500 lg:px-6">
          Đang tải gian hàng GreenRoots Farm...
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
