import { Award, ShieldCheck } from "lucide-react";
import { Badge } from "@greenroots/ui";
import { formatVnd, roundQuantity } from "@/lib/format";
import type { ProductDto } from "@/services/storefront.service";
import type { StorefrontProduct } from "@/types/storefront.types";
import {
  filterApprovedProductImages,
  formatCertificationSummary,
  formatQuantityDisplay,
  getCatalogDiscountPercent,
} from "../utils/product-detail.utils";
import { ProductDetailActions } from "./product-detail-actions";
import { ProductImageGallery } from "./product-image-gallery";

interface ProductDetailHeroProps {
  readonly product: StorefrontProduct;
  readonly dto: ProductDto;
}

/**
 * SF-02 Product Detail overview using a flat, divider-driven hierarchy
 * without nested card boxes on mobile or desktop, backed solely by `ProductDto`.
 *
 * @param props Normalized `StorefrontProduct` projection and raw `ProductDto`.
 * @returns Product gallery, flat pricing/title summary, attribute rows, and purchase actions.
 */
export function ProductDetailHero({ product, dto }: ProductDetailHeroProps) {
  const displayPrice = dto.salePriceVnd ?? dto.basePriceVnd;
  const discountPercent = getCatalogDiscountPercent(
    dto.basePriceVnd,
    dto.salePriceVnd,
  );
  const hasSalePrice = discountPercent !== null;
  const savings = hasSalePrice ? dto.basePriceVnd - displayPrice : 0;
  const approvedImages = filterApprovedProductImages(dto.imageUrls);
  const isOutOfStock = roundQuantity(dto.availableQuantity) <= 0;

  const attributes = [
    { label: "Quy cách", value: dto.unit },
    { label: "Danh mục", value: dto.category.name },
    {
      label: "Chứng nhận",
      value: formatCertificationSummary(dto.isVietGap, dto.isUsda),
    },
    {
      label: "Đặt theo kỳ",
      value: dto.isSubscriptionEligible ? "Có" : "Không",
    },
  ] as const;

  return (
    <div className="grid grid-cols-1 items-start lg:grid-cols-12 lg:gap-8">
      <div className="lg:col-span-5">
        <ProductImageGallery productName={dto.name} images={approvedImages} />
      </div>

      <div className="flex flex-col divide-y divide-border-subtle lg:col-span-7">
        <div className="order-2 flex flex-col gap-2.5 px-4 py-3.5 lg:order-1 lg:px-0 lg:pt-0 lg:pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="h-auto border-0 bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-brand-dark">
              {dto.category.name}
            </Badge>
            {dto.isVietGap ? (
              <Badge
                variant="outline"
                className="h-auto border-border-subtle bg-surface-card px-2.5 py-0.5 text-xs font-semibold text-brand-dark"
              >
                <ShieldCheck
                  className="size-3.5 text-brand-forest"
                  aria-hidden="true"
                />
                VietGAP
              </Badge>
            ) : null}
            {dto.isUsda ? (
              <Badge
                variant="outline"
                className="h-auto border-border-subtle bg-surface-card px-2.5 py-0.5 text-xs font-semibold text-brand-dark"
              >
                <Award
                  className="size-3.5 text-brand-forest"
                  aria-hidden="true"
                />
                USDA Organic
              </Badge>
            ) : null}
            {hasSalePrice ? (
              <Badge className="h-auto border-0 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 tabular-nums">
                -{discountPercent}%
              </Badge>
            ) : null}
          </div>

          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl lg:text-3xl lg:font-extrabold">
            {dto.name}
          </h1>

          {dto.description ? (
            <p className="max-w-prose text-sm leading-relaxed text-pretty text-gray-600">
              {dto.description}
            </p>
          ) : null}
        </div>

        <div className="order-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5 px-4 py-3.5 lg:order-2 lg:px-0 lg:py-4">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span
              className={`text-2xl font-extrabold tabular-nums lg:text-3xl ${
                hasSalePrice ? "text-status-spoiled" : "text-brand-forest"
              }`}
            >
              {formatVnd(displayPrice)}
            </span>
            {hasSalePrice ? (
              <>
                <span className="text-sm text-gray-500 tabular-nums line-through lg:text-base">
                  {formatVnd(dto.basePriceVnd)}
                </span>
                <span className="text-xs font-semibold text-red-700 tabular-nums lg:text-sm">
                  Tiết kiệm {formatVnd(savings)}
                </span>
              </>
            ) : null}
          </div>

          <span
            className={`text-xs font-semibold tabular-nums lg:text-sm ${
              isOutOfStock ? "text-status-spoiled" : "text-gray-600"
            }`}
          >
            {isOutOfStock
              ? "Tạm hết hàng"
              : `Còn lại ${formatQuantityDisplay(dto.availableQuantity)} ${dto.unit}`}
          </span>
        </div>

        <div className="order-3 divide-y divide-border-subtle">
          {attributes.map(({ label, value }) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 px-4 py-2.5 lg:px-0 lg:py-3"
            >
              <span className="text-xs font-medium text-gray-500 lg:text-sm">
                {label}
              </span>
              <span className="text-sm font-semibold text-gray-900">
                {value}
              </span>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 z-30 order-4 bg-surface-card px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:static lg:bg-transparent lg:px-0 lg:pt-4 lg:pb-0 lg:shadow-none">
          <ProductDetailActions product={product} />
        </div>
      </div>
    </div>
  );
}
