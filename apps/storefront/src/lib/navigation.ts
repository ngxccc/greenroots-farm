/**
 * Builds the Storefront product catalog search URL, omitting `?q=` when blank.
 *
 * @param rawQuery Raw search input entered by the visitor.
 * @returns Normalized `/products` path with optional encoded query parameter.
 */
export function buildProductSearchHref(rawQuery: string): string {
  const trimmed = rawQuery.trim();
  return trimmed ? `/products?q=${encodeURIComponent(trimmed)}` : "/products";
}

/**
 * Normalizes a batch code into its canonical `/trace/[batchCode]` route path.
 *
 * @param rawCode Raw batch code input from a form or scan action.
 * @returns Uppercase-encoded `/trace/[batchCode]` path, or `null` when blank.
 */
export function buildTraceDetailHref(rawCode: string): string | null {
  const normalized = rawCode.trim().toUpperCase();
  return normalized ? `/trace/${encodeURIComponent(normalized)}` : null;
}
