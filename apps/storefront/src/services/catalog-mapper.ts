import { filterApprovedProductImages } from "@/lib/image-url";
import type { ProductDto, StorefrontProduct } from "@/types/catalog.types";

function formatUnitLabel(unit: string): string {
  const trimmed = unit.trim();
  if (!trimmed || /\d/.test(trimmed)) {
    return trimmed;
  }
  return `1 ${trimmed}`;
}

/**
 * Maps a `ProductDto` from the catalog API to a `StorefrontProduct` suitable
 * for the cart store and storefront UI components.
 *
 * @param dto Product DTO returned by `/api/v1/products`.
 * @param shelfCategoryId Optional root shelf category ID to suppress redundant category badges.
 * @returns Normalized `StorefrontProduct` projection.
 */
export function mapProductDtoToStorefront(
  dto: ProductDto,
  shelfCategoryId?: string,
): StorefrontProduct {
  const fallbackBadge =
    shelfCategoryId && dto.category.id === shelfCategoryId
      ? undefined
      : dto.category.name;

  return {
    id: dto.id,
    slug: dto.slug,
    name: dto.name,
    unit: dto.unit,
    unitLabel: formatUnitLabel(dto.unit),
    basePriceVnd: dto.basePriceVnd,
    salePriceVnd: dto.salePriceVnd ?? undefined,
    availableQuantity: dto.availableQuantity,
    badgeText: dto.isVietGap
      ? "VietGAP"
      : dto.isUsda
        ? "USDA Organic"
        : fallbackBadge,
    imageUrl: filterApprovedProductImages(dto.imageUrls)[0],
    isRescueDeal: false,
    isSubscriptionEligible: dto.isSubscriptionEligible,
  };
}
