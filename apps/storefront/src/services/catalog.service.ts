import { resolveSharedApiErrorMessage } from "@greenroots/shared";
import { api } from "@/lib/api-client";
import { mapProductDtoToStorefront } from "@/services/catalog-mapper";
import {
  buildCatalogApiQuery,
  buildCategoryTree,
  CATALOG_PAGE_LIMIT,
  type CatalogFilterState,
} from "@/services/catalog-query";
import type {
  CatalogListingDeps,
  CatalogListingResult,
  CatalogPaginationMeta,
  HomeCatalogDeps,
  HomeCatalogOptions,
  HomeCategoryShelf,
  ProductDetailDeps,
  ProductDetailResult,
} from "@/types/catalog.types";

/** Default number of root category shelves displayed on the SF-01 home page. */
export const HOME_MAX_SHELVES = 6;

/** Default number of product cards displayed per category shelf (4x2 desktop grid). */
export const HOME_SHELF_PRODUCTS_LIMIT = 8;

const defaultHomeCatalogDeps: HomeCatalogDeps = {
  fetchCategories: (query) =>
    api.GET("/api/v1/categories", { params: { query } }),
  fetchProductsByCategory: (query) =>
    api.GET("/api/v1/products", { params: { query } }),
};

const defaultProductDetailDeps: ProductDetailDeps = {
  fetchProductBySlug: (slug) =>
    api.GET("/api/v1/products/{slug}", {
      params: { path: { slug } },
    }),
};

const defaultCatalogListingDeps: CatalogListingDeps = {
  fetchCategories: (query) =>
    api.GET("/api/v1/categories", { params: { query } }),
  fetchProducts: (query) => api.GET("/api/v1/products", { params: { query } }),
};

function extractResponseStatus(result: {
  readonly response?: { readonly status: number };
  readonly error?: unknown;
}): number | undefined {
  if (result.response?.status !== undefined) {
    return result.response.status;
  }
  if (
    typeof result.error === "object" &&
    result.error !== null &&
    "status" in result.error &&
    typeof result.error.status === "number"
  ) {
    return result.error.status;
  }
  return undefined;
}

function extractProblemError(error: unknown):
  | {
      code?: string;
      detail?: string;
    }
  | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const record = error as Record<string, unknown>;
  return {
    code: typeof record.code === "string" ? record.code : undefined,
    detail: typeof record.detail === "string" ? record.detail : undefined,
  };
}

/**
 * Fetches active root categories ordered by `sortOrder:asc` and loads up to
 * `perShelfLimit` latest active products per root category (spanning two-level
 * child categories server-side). Empty shelves and failed category queries are
 * omitted so one partial failure cannot blank the entire home page.
 *
 * @param options Shelf count and per-shelf product limits (defaults: 6 shelves, 8 items).
 * @param deps Optional injectable API fetchers for deterministic unit tests.
 * @returns Non-empty `HomeCategoryShelf[]` ordered by category `sortOrder`.
 */
export async function fetchLiveHomeCatalog(
  options: HomeCatalogOptions = {},
  deps: HomeCatalogDeps = defaultHomeCatalogDeps,
): Promise<readonly HomeCategoryShelf[]> {
  const maxShelves = options.maxShelves ?? HOME_MAX_SHELVES;
  const perShelfLimit = options.perShelfLimit ?? HOME_SHELF_PRODUCTS_LIMIT;

  try {
    const categoriesRes = await deps.fetchCategories({
      rootOnly: true,
      limit: maxShelves,
      sort: "sortOrder:asc",
    });

    if (categoriesRes.error || !categoriesRes.data?.data.length) {
      return [];
    }

    const rootCategories = categoriesRes.data.data
      .filter((category) => category.isActive)
      .slice(0, maxShelves);

    if (!rootCategories.length) {
      return [];
    }

    const shelves = await Promise.all(
      rootCategories.map(
        async (category): Promise<HomeCategoryShelf | null> => {
          try {
            const productsRes = await deps.fetchProductsByCategory({
              categoryId: category.id,
              limit: perShelfLimit,
              sort: "createdAt:desc",
            });

            if (productsRes.error || !productsRes.data?.data.length) {
              return null;
            }

            const mappedProducts = productsRes.data.data
              .filter((dto) => dto.isActive)
              .slice(0, perShelfLimit)
              .map((dto) => mapProductDtoToStorefront(dto, category.id));

            if (!mappedProducts.length) {
              return null;
            }

            return {
              id: category.id,
              name: category.name,
              slug: category.slug,
              products: mappedProducts,
            };
          } catch {
            return null;
          }
        },
      ),
    );

    return shelves.filter(
      (shelf): shelf is HomeCategoryShelf => shelf !== null,
    );
  } catch {
    return [];
  }
}

/**
 * Fetches a single active catalog product by kebab-case slug from `GET /api/v1/products/:slug`.
 * Returns `"not_found"` for `400`/`404` or inactive products/categories and `"error"` on
 * transient `5xx` or network outages without falling back to static showcase fixtures.
 *
 * @param slug Candidate product kebab-case slug from the route param.
 * @param deps Optional injectable transport adapter for deterministic unit tests.
 * @returns Discriminated `ProductDetailResult`.
 */
export async function fetchLiveProductBySlug(
  slug: string,
  deps: ProductDetailDeps = defaultProductDetailDeps,
): Promise<ProductDetailResult> {
  if (!slug.trim()) {
    return { status: "not_found" };
  }

  try {
    const result = await deps.fetchProductBySlug(slug);
    if (result.error || !result.data?.data) {
      const status = extractResponseStatus(result);
      if (status === 400 || status === 404) {
        return { status: "not_found" };
      }
      return { status: "error" };
    }

    const dto = result.data.data;
    if (!dto.isActive) {
      return { status: "not_found" };
    }

    return {
      status: "ok",
      product: mapProductDtoToStorefront(dto),
      dto,
    };
  } catch {
    return { status: "error" };
  }
}

/**
 * Fetches live paginated products and the two-level active category tree for SF-02.
 * Category failures degrade silently to an empty sidebar while product failures return
 * a localized RFC 9457 error message without falling back to mock fixtures.
 *
 * @param filters Sanitized URL filter state from `parseCatalogSearchParams`.
 * @param deps Optional injectable API transport for unit testing.
 * @returns `CatalogListingResult` containing products, 2-level categories, and pagination meta.
 */
export async function fetchCatalogListing(
  filters: CatalogFilterState,
  deps: CatalogListingDeps = defaultCatalogListingDeps,
): Promise<CatalogListingResult> {
  const fallbackMeta: CatalogPaginationMeta = {
    page: filters.page,
    limit: CATALOG_PAGE_LIMIT,
    total: 0,
    totalPages: 0,
  };

  const apiQuery = buildCatalogApiQuery(filters);

  const [categoriesOutcome, productsOutcome] = await Promise.allSettled([
    deps.fetchCategories({ limit: 100, sort: "sortOrder:asc" }),
    deps.fetchProducts(apiQuery),
  ]);

  const categories =
    categoriesOutcome.status === "fulfilled" &&
    !categoriesOutcome.value.error &&
    categoriesOutcome.value.data?.data
      ? buildCategoryTree(categoriesOutcome.value.data.data)
      : [];

  if (productsOutcome.status === "rejected") {
    return {
      products: [],
      categories,
      meta: fallbackMeta,
      errorMessage: resolveSharedApiErrorMessage(undefined),
    };
  }

  const productsRes = productsOutcome.value;
  if (productsRes.error || !productsRes.data?.data) {
    const problem = extractProblemError(productsRes.error);
    return {
      products: [],
      categories,
      meta: fallbackMeta,
      errorMessage: resolveSharedApiErrorMessage(
        problem?.code,
        problem?.detail,
      ),
    };
  }

  const rawItems = productsRes.data.data;
  const products = rawItems
    .filter((dto) => dto.isActive)
    .map((dto) => mapProductDtoToStorefront(dto));

  const rawMeta = productsRes.data.meta;
  const total =
    typeof rawMeta?.total === "number" ? rawMeta.total : products.length;
  const limit =
    typeof rawMeta?.limit === "number" && rawMeta.limit > 0
      ? rawMeta.limit
      : CATALOG_PAGE_LIMIT;
  const page = typeof rawMeta?.page === "number" ? rawMeta.page : filters.page;
  const totalPages =
    typeof rawMeta?.totalPages === "number"
      ? rawMeta.totalPages
      : Math.ceil(total / limit);

  return {
    products,
    categories,
    meta: { page, limit, total, totalPages },
  };
}
