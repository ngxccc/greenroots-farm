import Link from "next/link";
import { Suspense } from "react";
import { ProductCard } from "@/features/home/components/product-card";
import { getShowcaseCatalog } from "@/services/storefront.service";

async function ProductsList({
  searchParams,
}: {
  readonly searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { products } = getShowcaseCatalog();
  const query = q?.trim().toLowerCase() ?? "";
  const filtered = query
    ? products.filter((item) => item.name.toLowerCase().includes(query))
    : products;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
        <div>
          <h1 className="text-xl font-extrabold text-brand-dark">
            Danh mục nông sản sạch
          </h1>
          {query ? (
            <p className="mt-0.5 text-xs text-gray-500">
              Kết quả tìm kiếm cho &ldquo;{q}&rdquo; ({filtered.length} sản
              phẩm)
            </p>
          ) : null}
        </div>
        <Link
          href="/"
          className="text-xs font-bold text-brand-forest hover:underline"
        >
          Về trang chủ
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}

export default function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-gray-500 lg:px-6">
          Đang tải danh mục nông sản...
        </div>
      }
    >
      <ProductsList searchParams={searchParams} />
    </Suspense>
  );
}
