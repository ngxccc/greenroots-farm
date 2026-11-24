import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Skeleton } from "@greenroots/ui";
import { CatalogView } from "@/features/catalog/components/catalog-view";
import { ProductGridSkeleton } from "@/features/home/components/product-card";
import {
  CATALOG_PAGE_LIMIT,
  parseCatalogSearchParams,
  type RawCatalogSearchParams,
} from "@/services/catalog-query";
import { fetchCatalogListing } from "@/services/catalog.service";

export const metadata: Metadata = {
  title: "Sản phẩm",
};

async function CatalogLoader({
  searchParams,
}: {
  readonly searchParams: Promise<RawCatalogSearchParams>;
}) {
  await connection();
  const rawParams = await searchParams;
  const filters = parseCatalogSearchParams(rawParams);
  const { products, categories, meta, errorMessage } =
    await fetchCatalogListing(filters);

  return (
    <CatalogView
      products={products}
      categories={categories}
      filters={filters}
      meta={meta}
      errorMessage={errorMessage}
    />
  );
}

export default function ProductsPage({
  searchParams,
}: {
  readonly searchParams: Promise<RawCatalogSearchParams>;
}) {
  return (
    <Suspense
      fallback={
        <div
          aria-hidden="true"
          className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6"
        >
          <div className="flex flex-col justify-between gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-end">
            <div className="space-y-2">
              <Skeleton className="h-7 w-64 bg-gray-200" />
              <Skeleton className="h-4 w-48 bg-gray-100" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-20 bg-gray-200 lg:hidden" />
              <Skeleton className="h-9 w-44 bg-gray-200" />
            </div>
          </div>

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            <div className="hidden space-y-4 border-r border-border-subtle pr-5 lg:col-span-3 lg:block">
              <Skeleton className="h-5 w-20 bg-gray-200" />
              <div className="space-y-2 border-t border-border-subtle pt-3">
                <Skeleton className="h-4 w-28 bg-gray-200" />
                <Skeleton className="h-7 w-full bg-gray-100" />
                <Skeleton className="h-7 w-5/6 bg-gray-100" />
                <Skeleton className="h-7 w-4/5 bg-gray-100" />
              </div>
              <div className="space-y-2 border-t border-border-subtle pt-3">
                <Skeleton className="h-4 w-24 bg-gray-200" />
                <Skeleton className="h-4 w-36 bg-gray-100" />
                <Skeleton className="h-4 w-40 bg-gray-100" />
              </div>
              <div className="space-y-2 border-t border-border-subtle pt-3">
                <Skeleton className="h-4 w-24 bg-gray-200" />
                <Skeleton className="h-4 w-32 bg-gray-100" />
                <Skeleton className="h-4 w-36 bg-gray-100" />
                <Skeleton className="h-4 w-32 bg-gray-100" />
              </div>
            </div>

            <div className="lg:col-span-9">
              <ProductGridSkeleton count={CATALOG_PAGE_LIMIT} />
            </div>
          </div>
        </div>
      }
    >
      <CatalogLoader searchParams={searchParams} />
    </Suspense>
  );
}
