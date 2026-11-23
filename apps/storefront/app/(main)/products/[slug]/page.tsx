import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, Card, CardContent, Skeleton } from "@greenroots/ui";
import { ArrowLeft, Leaf, ShieldCheck } from "lucide-react";
import { ProductCard } from "@/features/home/components/product-card";
import { formatVnd } from "@/lib/format";
import { getShowcaseProductBySlug } from "@/services/storefront.service";

async function CachedProductDetail({ slug }: { readonly slug: string }) {
  "use cache";
  const product = await Promise.resolve(getShowcaseProductBySlug(slug));
  if (!product) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 lg:px-6">
      <Link
        href="/products"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-forest hover:underline"
      >
        <ArrowLeft className="size-4" />
        Quay lại danh mục
      </Link>

      <Card className="border-border-subtle bg-white">
        <CardContent className="grid items-center gap-6 p-5 md:grid-cols-2">
          <div className="flex h-56 items-center justify-center rounded-2xl bg-green-50">
            <Leaf className="size-20 text-brand-forest/70" />
          </div>
          <div className="space-y-3">
            <Badge className="border-0 bg-green-100 font-bold text-brand-dark">
              {product.badgeText}
            </Badge>
            <h1 className="text-2xl font-extrabold text-gray-900">
              {product.name}
            </h1>
            <p className="text-xs text-gray-500">
              Quy cách: {product.unitLabel} · Tổng tồn kho khả dụng:{" "}
              {product.availableQuantity}
            </p>
            <p className="text-2xl font-extrabold text-brand-forest">
              {formatVnd(product.salePriceVnd ?? product.basePriceVnd)}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-gray-600">
              <ShieldCheck className="size-4 shrink-0 text-status-fresh" />
              Hệ thống tự động xuất theo lô cận hạn trước (FEFO) khi đóng gói.
            </p>
            <div className="pt-2">
              <ProductCard product={product} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

async function ProductParamsLoader({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <CachedProductDetail slug={slug} />;
}

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div
          aria-hidden="true"
          className="mx-auto max-w-3xl space-y-4 px-4 py-8 lg:px-6"
        >
          <Skeleton className="h-4 w-32 bg-gray-200" />
          <div className="grid items-center gap-6 rounded-xl border border-border-subtle bg-white p-5 md:grid-cols-2">
            <Skeleton className="h-56 w-full rounded-2xl bg-green-50" />
            <div className="space-y-3">
              <Skeleton className="h-5 w-28 rounded-full bg-green-100" />
              <Skeleton className="h-7 w-3/4 bg-gray-200" />
              <Skeleton className="h-4 w-2/3 bg-gray-200" />
              <Skeleton className="h-8 w-1/2 bg-gray-200" />
              <Skeleton className="h-10 w-full rounded-lg bg-green-100/70" />
            </div>
          </div>
        </div>
      }
    >
      <ProductParamsLoader params={params} />
    </Suspense>
  );
}
