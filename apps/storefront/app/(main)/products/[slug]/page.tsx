import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, cache } from "react";
import { AlertCircle, ArrowLeft } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Skeleton,
  buttonVariants,
} from "@greenroots/ui";
import { ProductDetailHero } from "@/features/product-detail";
import { fetchLiveProductBySlug } from "@/services/storefront.service";

const getProductBySlugCached = cache(async (slug: string) =>
  fetchLiveProductBySlug(slug),
);

/**
 * Resolves dynamic page `<title>` and description from the live product catalog.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const result = await getProductBySlugCached(slug);

  if (result.status !== "ok") {
    return { title: "Chi tiết sản phẩm" };
  }

  return {
    title: result.dto.name,
    description:
      result.dto.description ??
      `${result.dto.name} — nông sản hữu cơ tươi sạch tại GreenRoots Farm.`,
  };
}

async function ProductDetailContent({ slug }: { readonly slug: string }) {
  await connection();
  const result = await getProductBySlugCached(slug);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-8 lg:px-6">
        <Alert
          variant="destructive"
          className="rounded-2xl border-red-200 bg-white p-5"
        >
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle className="font-bold text-gray-900">
            Không thể tải thông tin sản phẩm
          </AlertTitle>
          <AlertDescription className="text-gray-600">
            Hệ thống tạm thời chưa kết nối được tới danh mục trực tiếp. Vui lòng
            tải lại trang hoặc quay về trang chủ.
          </AlertDescription>
        </Alert>
        <div>
          <Link
            href="/products"
            className={buttonVariants({
              variant: "outline",
              className:
                "border-border-subtle bg-surface-card font-semibold text-gray-900 hover:border-brand-forest",
            })}
          >
            Xem danh sách sản phẩm
          </Link>
        </div>
      </div>
    );
  }

  const { product, dto } = result;

  return (
    <div className="w-full flex-1 bg-surface-card pb-16 lg:pb-0">
      <div className="mx-auto flex w-full max-w-6xl flex-col lg:gap-5 lg:px-6 lg:pt-5 lg:pb-10">
        <div className="hidden lg:block">
          <Link
            href="/products"
            className="inline-flex w-fit items-center gap-1.5 rounded text-xs font-semibold text-brand-forest hover:underline focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:outline-none"
          >
            <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
            <span>Quay lại danh mục</span>
          </Link>
        </div>

        <section aria-label="Thông tin chi tiết sản phẩm">
          <ProductDetailHero product={product} dto={dto} />
        </section>
      </div>
    </div>
  );
}

async function ProductParamsLoader({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ProductDetailContent slug={slug} />;
}

/**
 * SF-02 Customer Product Detail Page (`/products/[slug]`).
 */
export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div aria-hidden="true" className="w-full flex-1 bg-surface-card">
          <div className="mx-auto flex w-full max-w-6xl flex-col lg:gap-5 lg:px-6 lg:pt-5 lg:pb-10">
            <div className="hidden lg:block">
              <Skeleton className="h-4 w-32 bg-gray-200" />
            </div>
            <div className="grid grid-cols-1 items-start lg:grid-cols-12 lg:gap-8">
              <Skeleton className="aspect-4/3 w-full bg-gray-100 lg:col-span-5 lg:rounded-xl" />
              <div className="flex flex-col gap-3 p-4 lg:col-span-7 lg:gap-4 lg:p-0">
                <Skeleton className="h-8 w-1/2 bg-gray-200" />
                <Skeleton className="h-6 w-3/4 bg-gray-200" />
                <Skeleton className="h-14 w-full bg-gray-100" />
                <Skeleton className="h-24 w-full bg-gray-100" />
                <Skeleton className="h-11 w-full rounded-xl bg-green-100/70" />
              </div>
            </div>
          </div>
        </div>
      }
    >
      <ProductParamsLoader params={params} />
    </Suspense>
  );
}
