/**
 * Computes the integer VND unit price for a Flash Sale batch anchored on `products.base_price` (`ADR-0025`, `ADR-0050`).
 */
export function computeFlashSaleUnitPriceVnd(
  basePriceVnd: number,
  discountPercent: number,
): number {
  return Math.round((basePriceVnd * (100 - discountPercent)) / 100);
}
