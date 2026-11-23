import { BUSINESS_RULES } from "@greenroots/shared";
import { roundQuantity } from "@/lib/format";

/**
 * Resolves the initial picker quantity: `1` by default when at least 1 unit remains,
 * or the exact fractional remainder (e.g. `0.5`) when `0 < availableQuantity < 1`.
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
 * Clamps a numeric quantity strictly within `[min(ORDER_ITEM_MIN_QUANTITY, remainingAddable), remainingAddable]`.
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
  const minAllowed = Math.min(
    BUSINESS_RULES.ORDER_ITEM_MIN_QUANTITY,
    maxAllowed,
  );
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
