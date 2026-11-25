import type { components } from "@/types/api-schema";
import type {
  CatalogApiQuery,
  CatalogCategoryNode,
} from "@/features/catalog/utils/catalog-query";

/** Shelf category bucket key used on the SF-01 home page and navigation links. */
export type CategoryShelfKey = "rescue" | "leaf" | "fruit" | "spice";

/** Alias for the generated OpenAPI category DTO. */
export type CategoryDto = components["schemas"]["CategoryDto"];

/** Alias for the generated OpenAPI product DTO. */
export type ProductDto = components["schemas"]["ProductDto"];

/** Normalized storefront product projection for cards, cart store, and detail views. */
export interface StorefrontProduct {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly unit: string;
  readonly unitLabel: string;
  readonly basePriceVnd: number;
  readonly salePriceVnd?: number;
  readonly availableQuantity: number;
  readonly badgeText?: string;
  readonly imageUrl?: string;
  readonly hoursRemaining?: number;
  readonly isRescueDeal: boolean;
  readonly rescueBatchProgressPct?: number;
  readonly isSubscriptionEligible: boolean;
}

/** Category shelf grouping displayed on the SF-01 home page. */
export interface HomeCategoryShelf {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly products: readonly StorefrontProduct[];
}

/** Options controlling root shelf count and per-shelf product cap for SF-01. */
export interface HomeCatalogOptions {
  readonly maxShelves?: number;
  readonly perShelfLimit?: number;
}

/**
 * Injectable transport dependencies for `fetchLiveHomeCatalog` so unit specs
 * remain isolated without mutating Bun's global module registry.
 */
export interface HomeCatalogDeps {
  readonly fetchCategories: (query: {
    rootOnly: true;
    limit: number;
    sort: "sortOrder:asc";
  }) => Promise<{ data?: { data: readonly CategoryDto[] }; error?: unknown }>;
  readonly fetchProductsByCategory: (query: {
    categoryId: string;
    limit: number;
    sort: "createdAt:desc";
  }) => Promise<{ data?: { data: readonly ProductDto[] }; error?: unknown }>;
}

/**
 * Injectable transport dependencies for `fetchLiveProductBySlug` so unit specs
 * remain isolated without mutating Bun's global module registry.
 */
export interface ProductDetailDeps {
  readonly fetchProductBySlug: (slug: string) => Promise<{
    data?: { data: ProductDto };
    error?: unknown;
    response?: { readonly status: number };
  }>;
}

/**
 * Discriminated live product lookup outcome distinguishing missing/inactive SKUs (`404`)
 * from transient upstream failures (`5xx` or offline network).
 */
export type ProductDetailResult =
  | {
      readonly status: "ok";
      readonly product: StorefrontProduct;
      readonly dto: ProductDto;
    }
  | { readonly status: "not_found" }
  | { readonly status: "error" };

/** Pagination metadata returned by `GET /api/v1/products`. */
export interface CatalogPaginationMeta {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
}

/** Injectable transport dependencies for `fetchCatalogListing`. */
export interface CatalogListingDeps {
  readonly fetchCategories: (query: {
    limit: number;
    sort: "sortOrder:asc";
  }) => Promise<{ data?: { data: readonly CategoryDto[] }; error?: unknown }>;
  readonly fetchProducts: (query: CatalogApiQuery) => Promise<{
    data?: {
      data: readonly ProductDto[];
      meta?: Partial<CatalogPaginationMeta>;
    };
    error?: unknown;
  }>;
}

/** Result returned by `fetchCatalogListing` for the SF-02 `/products` route. */
export interface CatalogListingResult {
  readonly products: readonly StorefrontProduct[];
  readonly categories: readonly CatalogCategoryNode[];
  readonly meta: CatalogPaginationMeta;
  readonly errorMessage?: string;
}
