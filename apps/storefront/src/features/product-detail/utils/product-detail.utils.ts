import { ORDER_QUANTITY_MIN, roundQuantity } from "@/lib/format";

/** Minimum purchasable quantity matching backend `ORDER_ITEM_MIN_QUANTITY` (`numeric(10, 2)`). */
export const PRODUCT_QUANTITY_MIN = ORDER_QUANTITY_MIN;

/** Standard stepper increment when clicking `-` / `+` buttons. */
export const PRODUCT_QUANTITY_STEP = 1;

const APPROVED_REMOTE_IMAGE_HOSTS = new Set([
  "res.cloudinary.com",
  "placehold.co",
  "img.vietqr.io",
]);

/**
 * Computes remaining stock headroom that can still be added to the customer's cart.
 *
 * @param availableQuantity Live aggregate sellable quantity from `ProductDto`.
 * @param inCartQuantity Current quantity already present in `useCartStore` for this product.
 * @returns Remaining addable quantity (>= 0, rounded to 2 decimal places).
 */
export function getRemainingAddableQuantity(
  availableQuantity: number,
  inCartQuantity: number,
): number {
  const safeAvailable = Number.isFinite(availableQuantity)
    ? Math.max(0, availableQuantity)
    : 0;
  const safeInCart = Number.isFinite(inCartQuantity)
    ? Math.max(0, inCartQuantity)
    : 0;
  return roundQuantity(Math.max(0, safeAvailable - safeInCart));
}

/**
 * Resolves the initial picker quantity: `1` by default when at least 1 unit remains,
 * or the exact fractional remainder (e.g. `0.5`) when `0 < remainingAddable < 1`.
 *
 * @param remainingAddable Remaining stock headroom available to add.
 * @returns Initial picker quantity (`0` when no stock remains).
 */
export function getDefaultOrderQuantity(remainingAddable: number): number {
  const normalized = roundQuantity(Math.max(0, remainingAddable));
  if (normalized <= 0) {
    return 0;
  }
  return normalized < 1 ? normalized : 1;
}

/**
 * Clamps a numeric quantity strictly within `[min(0.01, remainingAddable), remainingAddable]`.
 *
 * @param value Candidate quantity entered or stepped by the user.
 * @param remainingAddable Remaining stock headroom available to add.
 * @returns Clamped quantity rounded to 2 decimal places (`0` when no stock remains or non-finite).
 */
export function clampOrderQuantity(
  value: number,
  remainingAddable: number,
): number {
  const maxAllowed = roundQuantity(Math.max(0, remainingAddable));
  if (maxAllowed <= 0 || !Number.isFinite(value)) {
    return 0;
  }
  const minAllowed = Math.min(PRODUCT_QUANTITY_MIN, maxAllowed);
  return roundQuantity(Math.min(Math.max(value, minAllowed), maxAllowed));
}

/**
 * Parses a decimal quantity string (accepting both `.` and Vietnamese `,` separators).
 *
 * @param raw Raw text entered into the quantity input.
 * @returns Parsed positive number rounded to 2 decimal places, or `null` when invalid.
 */
export function parseOrderQuantityInput(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return roundQuantity(parsed);
}

/**
 * Formats a quantity cleanly for display without trailing zeroes (e.g. `1`, `0.5`, `1.25`).
 *
 * @param quantity Numeric quantity to format.
 * @returns Clean decimal string.
 */
export function formatQuantityDisplay(quantity: number): string {
  return String(roundQuantity(quantity));
}

/**
 * Validates that an image URL uses either an approved Next.js `remotePatterns` HTTPS host
 * or a local root-relative asset path (`/...`, excluding protocol-relative `//`).
 *
 * @param rawUrl Candidate product image URL.
 * @returns `true` when safe to pass to `next/image`.
 */
export function isApprovedStorefrontImageUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    return (
      parsed.protocol === "https:" &&
      APPROVED_REMOTE_IMAGE_HOSTS.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Filters a product's `imageUrls` array down to entries permitted by `next.config.ts`.
 *
 * @param imageUrls Raw `ProductDto.imageUrls` list.
 * @returns Approved image URLs preserving order.
 */
export function filterApprovedProductImages(
  imageUrls: readonly string[],
): string[] {
  return imageUrls.filter(isApprovedStorefrontImageUrl);
}

/**
 * Computes integer catalog markdown percentage when `salePriceVnd < basePriceVnd`.
 *
 * @param basePriceVnd Base SKU price in integer VND.
 * @param salePriceVnd Optional catalog markdown price in integer VND.
 * @returns Positive integer discount percentage (`1..99`), or `null` when not discounted.
 */
export function getCatalogDiscountPercent(
  basePriceVnd: number,
  salePriceVnd: number | null | undefined,
): number | null {
  if (
    salePriceVnd === null ||
    salePriceVnd === undefined ||
    basePriceVnd <= 0 ||
    salePriceVnd >= basePriceVnd
  ) {
    return null;
  }
  const pct = Math.round(((basePriceVnd - salePriceVnd) / basePriceVnd) * 100);
  return pct > 0 ? pct : null;
}

/**
 * Formats a concise Vietnamese certification summary from `ProductDto` boolean flags.
 *
 * @param isVietGap Whether the product carries VietGAP certification.
 * @param isUsda Whether the product carries USDA Organic certification.
 * @returns Human-readable certification label.
 */
export function formatCertificationSummary(
  isVietGap: boolean,
  isUsda: boolean,
): string {
  if (isVietGap && isUsda) {
    return "VietGAP & USDA Organic";
  }
  if (isVietGap) {
    return "VietGAP";
  }
  if (isUsda) {
    return "USDA Organic";
  }
  return "Canh tác hữu cơ";
}
