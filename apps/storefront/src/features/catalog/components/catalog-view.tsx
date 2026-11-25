"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@greenroots/ui";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  SearchX,
  SlidersHorizontal,
} from "lucide-react";
import { ProductCard } from "@/features/home/components/product-card";
import {
  buildCatalogHref,
  CATALOG_SORT_LABELS,
  CATALOG_SORT_OPTIONS,
  type CatalogCategoryNode,
  type CatalogFilterState,
} from "@/features/catalog/utils/catalog-query";
import type {
  CatalogPaginationMeta,
  StorefrontProduct,
} from "@/features/catalog/types/catalog.types";
import { CatalogFilterSidebar } from "./catalog-filter-sidebar";

interface CatalogViewProps {
  readonly products: readonly StorefrontProduct[];
  readonly categories: readonly CatalogCategoryNode[];
  readonly filters: CatalogFilterState;
  readonly meta: CatalogPaginationMeta;
  readonly errorMessage?: string;
}

function buildPageRange(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 1) return [];
  const pages = new Set<number>([1, totalPages]);
  for (
    let page = Math.max(1, currentPage - 1);
    page <= Math.min(totalPages, currentPage + 1);
    page += 1
  ) {
    pages.add(page);
  }
  return Array.from(pages).sort((a, b) => a - b);
}

/**
 * Interactive SF-02 product catalog view combining the desktop 2-level filter sidebar,
 * mobile `Sheet` filter drawer, 4-column desktop product grid, sort dropdown, and pagination.
 *
 * @param props Server-fetched products, category tree, sanitized URL filters, and pagination meta.
 * @returns Full catalog listing view.
 */
export function CatalogView({
  products,
  categories,
  filters,
  meta,
  errorMessage,
}: CatalogViewProps) {
  const router = useRouter();
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const handleUpdateFilters = (overrides: Partial<CatalogFilterState>) => {
    setMobileFilterOpen(false);
    router.push(buildCatalogHref(filters, overrides));
  };

  const handleResetFilters = () => {
    setMobileFilterOpen(false);
    router.push("/products");
  };

  const pageNumbers = buildPageRange(meta.page, meta.totalPages);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6">
      {/* Page Heading */}
      <div className="flex flex-col gap-3 border-b border-border-subtle pb-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-extrabold text-gray-900 sm:text-2xl">
              Danh mục nông sản hữu cơ
            </h1>
            <p className="text-xs text-gray-500 tabular-nums">
              {filters.q ? `Kết quả cho "${filters.q}" — ` : ""}
              Hiển thị {products.length} / {meta.total} sản phẩm khả dụng
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* Mobile Filter Sheet Trigger */}
            <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
              <SheetTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 border-border-subtle bg-white text-xs font-semibold text-gray-900 lg:hidden"
                  />
                }
              >
                <SlidersHorizontal className="size-3.5" aria-hidden="true" />
                Bộ lọc
              </SheetTrigger>
              <SheetContent side="left" className="w-80 overflow-y-auto p-5">
                <SheetHeader className="border-b border-border-subtle pb-3">
                  <SheetTitle className="text-base font-bold text-gray-900">
                    Bộ lọc sản phẩm
                  </SheetTitle>
                  <SheetDescription className="text-xs text-gray-500">
                    Lọc theo danh mục, chứng nhận và mức giá.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-4">
                  <CatalogFilterSidebar
                    categories={categories}
                    filters={filters}
                    onUpdateFilters={handleUpdateFilters}
                    onResetFilters={handleResetFilters}
                    showHeading={false}
                  />
                </div>
              </SheetContent>
            </Sheet>

            {/* Sort Select */}
            <Select
              value={filters.sort}
              onValueChange={(value) => {
                if (value) {
                  handleUpdateFilters({ sort: value });
                }
              }}
            >
              <SelectTrigger
                aria-label="Sắp xếp sản phẩm"
                className="h-9 min-w-44 border-border-subtle bg-white text-xs font-medium text-gray-900"
              >
                <SelectValue>{CATALOG_SORT_LABELS[filters.sort]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CATALOG_SORT_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option} className="text-xs">
                    {CATALOG_SORT_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* 2-Column Catalog Layout */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Desktop Sidebar */}
        <aside
          aria-label="Bộ lọc sản phẩm"
          className="hidden border-r border-border-subtle pr-5 lg:col-span-3 lg:block"
        >
          <CatalogFilterSidebar
            categories={categories}
            filters={filters}
            onUpdateFilters={handleUpdateFilters}
            onResetFilters={handleResetFilters}
          />
        </aside>

        {/* Product Grid Area */}
        <div className="flex flex-col gap-6 lg:col-span-9">
          {errorMessage ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" aria-hidden="true" />
              <AlertTitle>Không thể tải danh sách sản phẩm</AlertTitle>
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>{errorMessage}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => router.refresh()}
                  className="self-start border-border-subtle bg-white text-xs font-semibold text-gray-900"
                >
                  Thử lại
                </Button>
              </AlertDescription>
            </Alert>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-md border border-border-subtle bg-white px-6 py-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-green-50 text-brand-forest">
                <SearchX className="size-6" aria-hidden="true" />
              </span>
              <div className="max-w-md space-y-1">
                <h2 className="text-base font-bold text-gray-900">
                  Không tìm thấy sản phẩm phù hợp
                </h2>
                <p className="text-xs text-gray-500">
                  Thử thay đổi từ khóa tìm kiếm hoặc bỏ bớt bộ lọc để xem thêm
                  nông sản tươi mới.
                </p>
              </div>
              <Button
                type="button"
                onClick={handleResetFilters}
                className="mt-1 h-9 gap-1.5 rounded-md bg-brand-forest px-4 text-xs font-semibold text-white hover:bg-brand-dark"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Xóa tất cả bộ lọc
              </Button>
            </div>
          ) : (
            <section
              aria-label="Lưới sản phẩm nông sản"
              className="grid grid-cols-2 items-stretch gap-3 lg:grid-cols-4"
            >
              {products.map((product) => (
                <ProductCard key={product.id} product={product} showStock />
              ))}
            </section>
          )}

          {/* URL-Driven Pagination */}
          {meta.totalPages > 1 ? (
            <nav
              aria-label="Phân trang sản phẩm"
              className="flex flex-wrap items-center justify-center gap-1.5 border-t border-border-subtle pt-4"
            >
              {meta.page > 1 ? (
                <Link
                  href={buildCatalogHref(filters, { page: meta.page - 1 })}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border-subtle bg-white px-2.5 text-xs font-medium text-gray-700 transition-colors hover:border-brand-forest hover:text-brand-forest"
                >
                  <ChevronLeft className="size-3.5" aria-hidden="true" />
                  Trước
                </Link>
              ) : null}

              {pageNumbers.map((pageNumber, index) => {
                const prev = index > 0 ? pageNumbers[index - 1] : undefined;
                const showEllipsis =
                  prev !== undefined && pageNumber - prev > 1;
                const isCurrent = pageNumber === meta.page;

                return (
                  <span
                    key={pageNumber}
                    className="inline-flex items-center gap-1.5"
                  >
                    {showEllipsis ? (
                      <span className="px-1 text-xs text-gray-400">...</span>
                    ) : null}
                    <Link
                      href={buildCatalogHref(filters, { page: pageNumber })}
                      aria-current={isCurrent ? "page" : undefined}
                      className={`inline-flex size-8 items-center justify-center rounded-md border text-xs font-semibold tabular-nums transition-colors ${
                        isCurrent
                          ? "border-brand-forest bg-brand-forest text-white"
                          : "border-border-subtle bg-white text-gray-700 hover:border-brand-forest hover:text-brand-forest"
                      }`}
                    >
                      {pageNumber}
                    </Link>
                  </span>
                );
              })}

              {meta.page < meta.totalPages ? (
                <Link
                  href={buildCatalogHref(filters, { page: meta.page + 1 })}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border-subtle bg-white px-2.5 text-xs font-medium text-gray-700 transition-colors hover:border-brand-forest hover:text-brand-forest"
                >
                  Sau
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      </div>
    </div>
  );
}
