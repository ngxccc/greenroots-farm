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
        <div className="mx-auto max-w-screen-xl px-4 pt-[152px] pb-12 text-sm text-gray-500">
          Đang tải gian hàng GreenRoots Farm...
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
