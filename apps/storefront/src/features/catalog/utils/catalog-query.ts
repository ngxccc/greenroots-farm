import type { components } from "@/types/api-schema";

type CategoryDto = components["schemas"]["CategoryDto"];

/** Fixed page size for SF-02 (divisible by 2 mobile, 3 tablet, and 4 desktop columns). */
export const CATALOG_PAGE_LIMIT = 12;

/** Maximum length accepted for the `q` search query parameter. */
export const CATALOG_MAX_SEARCH_LENGTH = 100;

/** Strict lowercase kebab-case slug pattern matching `ADR-0025`. */
const CATALOG_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Supported sort options on SF-02 aligned with `PRODUCT_SORT_OPTIONS`. */
export const CATALOG_SORT_OPTIONS = [
  "createdAt:desc",
  "price:asc",
  "price:desc",
  "name:asc",
] as const;

export type CatalogSortOption = (typeof CATALOG_SORT_OPTIONS)[number];

/** Human-readable Vietnamese labels for each whitelisted sort option. */
export const CATALOG_SORT_LABELS: Record<CatalogSortOption, string> = {
  "createdAt:desc": "Mới nhất",
  "price:asc": "Giá: Thấp đến cao",
  "price:desc": "Giá: Cao đến thấp",
  "name:asc": "Tên: A–Z",
};

/** Supported price range presets on SF-02. */
export const CATALOG_PRICE_PRESETS = [
  "all",
  "under-25",
  "25-40",
  "over-40",
] as const;

export type CatalogPricePreset = (typeof CATALOG_PRICE_PRESETS)[number];

/** Vietnamese labels for price range presets. */
export const CATALOG_PRICE_PRESET_LABELS: Record<CatalogPricePreset, string> = {
  all: "Tất cả mức giá",
  "under-25": "Dưới 25.000₫",
  "25-40": "25.000₫ – 40.000₫",
  "over-40": "Trên 40.000₫",
};

/** Validated and sanitized SF-02 catalog filter state derived from URL `searchParams`. */
export interface CatalogFilterState {
  readonly q?: string;
  readonly category?: string;
  readonly vietgap: boolean;
  readonly usda: boolean;
  readonly price: CatalogPricePreset;
  readonly sort: CatalogSortOption;
  readonly page: number;
}

/** Raw Next.js `searchParams` input shape. */
export type RawCatalogSearchParams = Record<
  string,
  string | string[] | undefined
>;

/** Query parameters forwarded to `GET /api/v1/products`. */
export interface CatalogApiQuery {
  readonly q?: string;
  readonly categorySlug?: string;
  readonly isVietGap?: true;
  readonly isUsda?: true;
  readonly minPriceVnd?: number;
  readonly maxPriceVnd?: number;
  readonly page: number;
  readonly limit: number;
  readonly sort: CatalogSortOption;
}

/** Two-level active category node for the SF-02 filter sidebar. */
export interface CatalogCategoryNode {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly sortOrder: number;
  readonly children: readonly CatalogCategoryNode[];
}

function readSingleParam(
  raw: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
}

function isCatalogSortOption(value: string): value is CatalogSortOption {
  return (CATALOG_SORT_OPTIONS as readonly string[]).includes(value);
}

function isCatalogPricePreset(value: string): value is CatalogPricePreset {
  return (CATALOG_PRICE_PRESETS as readonly string[]).includes(value);
}

/**
 * Parses and sanitizes untrusted URL `searchParams` into a closed `CatalogFilterState`
 * so invalid slugs, negative pages, or unknown sort keys never reach `.strict()` API DTOs.
 *
 * @param rawParams Raw `searchParams` record from Next.js App Router.
 * @returns Sanitized `CatalogFilterState` with safe defaults.
 */
export function parseCatalogSearchParams(
  rawParams: RawCatalogSearchParams = {},
): CatalogFilterState {
  const rawQ = readSingleParam(rawParams.q)?.trim() ?? "";
  const q = rawQ ? rawQ.slice(0, CATALOG_MAX_SEARCH_LENGTH) : undefined;

  const rawCategory = readSingleParam(rawParams.category)?.trim() ?? "";
  const category = CATALOG_SLUG_REGEX.test(rawCategory)
    ? rawCategory
    : undefined;

  const vietgap = readSingleParam(rawParams.vietgap) === "true";
  const usda = readSingleParam(rawParams.usda) === "true";

  const rawPrice = readSingleParam(rawParams.price)?.trim() ?? "";
  const price: CatalogPricePreset = isCatalogPricePreset(rawPrice)
    ? rawPrice
    : "all";

  const rawSort = readSingleParam(rawParams.sort)?.trim() ?? "";
  const sort: CatalogSortOption = isCatalogSortOption(rawSort)
    ? rawSort
    : "createdAt:desc";

  const rawPage = readSingleParam(rawParams.page)?.trim() ?? "";
  const parsedPage = Number.parseInt(rawPage, 10);
  const page =
    Number.isInteger(parsedPage) &&
    parsedPage >= 1 &&
    String(parsedPage) === rawPage
      ? parsedPage
      : 1;

  return {
    q,
    category,
    vietgap,
    usda,
    price,
    sort,
    page,
  };
}

/**
 * Maps a sanitized `CatalogFilterState` to `GET /api/v1/products` query parameters.
 * Never emits `categoryId` alongside `categorySlug` (`ADR-0025`).
 *
 * @param filters Sanitized catalog filter state.
 * @returns Strictly typed API query parameters.
 */
export function buildCatalogApiQuery(
  filters: CatalogFilterState,
): CatalogApiQuery {
  let minPriceVnd: number | undefined;
  let maxPriceVnd: number | undefined;

  if (filters.price === "under-25") {
    maxPriceVnd = 24_999;
  } else if (filters.price === "25-40") {
    minPriceVnd = 25_000;
    maxPriceVnd = 40_000;
  } else if (filters.price === "over-40") {
    minPriceVnd = 40_001;
  }

  return {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.category ? { categorySlug: filters.category } : {}),
    ...(filters.vietgap ? { isVietGap: true as const } : {}),
    ...(filters.usda ? { isUsda: true as const } : {}),
    ...(minPriceVnd !== undefined ? { minPriceVnd } : {}),
    ...(maxPriceVnd !== undefined ? { maxPriceVnd } : {}),
    page: filters.page,
    limit: CATALOG_PAGE_LIMIT,
    sort: filters.sort,
  };
}

/**
 * Serializes a `/products` href from the current filter state and optional overrides.
 * Resets `page` to `1` (omitted from URL) whenever any non-page filter changes.
 *
 * @param current Current sanitized filter state.
 * @param overrides Partial filter or page updates to apply.
 * @returns Normalized `/products` URL path with query string when non-default.
 */
export function buildCatalogHref(
  current: CatalogFilterState,
  overrides: Partial<CatalogFilterState> = {},
): string {
  const isPageOnlyChange =
    overrides.page !== undefined &&
    overrides.q === undefined &&
    overrides.category === undefined &&
    overrides.vietgap === undefined &&
    overrides.usda === undefined &&
    overrides.price === undefined &&
    overrides.sort === undefined;

  const next: CatalogFilterState = {
    ...current,
    ...overrides,
    page: isPageOnlyChange ? (overrides.page ?? 1) : 1,
  };

  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.category) params.set("category", next.category);
  if (next.vietgap) params.set("vietgap", "true");
  if (next.usda) params.set("usda", "true");
  if (next.price !== "all") params.set("price", next.price);
  if (next.sort !== "createdAt:desc") params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));

  const qs = params.toString();
  return qs ? `/products?${qs}` : "/products";
}

/**
 * Groups flat active categories from `GET /api/v1/categories` into a two-level
 * hierarchy (`parentId === null` roots and direct active children) ordered by `sortOrder:asc`.
 *
 * @param categories Flat category list from the API.
 * @returns Ordered two-level category tree.
 */
export function buildCategoryTree(
  categories: readonly CategoryDto[],
): readonly CatalogCategoryNode[] {
  const active = categories
    .filter((cat) => cat.isActive)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const childrenByParent = new Map<string, CatalogCategoryNode[]>();
  const roots: CategoryDto[] = [];

  for (const cat of active) {
    if (cat.parentId === null) {
      roots.push(cat);
    } else {
      const bucket = childrenByParent.get(cat.parentId) ?? [];
      bucket.push({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        sortOrder: cat.sortOrder,
        children: [],
      });
      childrenByParent.set(cat.parentId, bucket);
    }
  }

  return roots.map((root) => ({
    id: root.id,
    name: root.name,
    slug: root.slug,
    sortOrder: root.sortOrder,
    children: childrenByParent.get(root.id) ?? [],
  }));
}
