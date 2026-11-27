import { api, extractApiErrorMessage } from "@/lib/api-client";
import type {
  CategoryDto,
  CreateCategoryDto,
  CreateProductDto,
  ProductDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from "./catalog-utils";

/** TanStack Query cache keys for catalog management. */
export const CATALOG_QUERY_KEYS = {
  categories: ["admin", "categories"] as const,
  products: (params: AdminProductsQueryParams) =>
    ["admin", "products", params] as const,
  allProductsForCounts: ["admin", "products", "counts"] as const,
};

/**
 * Query parameters supported by `GET /api/v1/admin/products`.
 */
export interface AdminProductsQueryParams {
  readonly q?: string;
  readonly categoryId?: string;
  readonly isActive?: boolean;
  readonly page?: number;
  readonly limit?: number;
}

/**
 * Fetches all non-deleted categories (including inactive) for the backoffice tree and selectors.
 */
export async function fetchAdminCategories(): Promise<CategoryDto[]> {
  const { data, error } = await api.GET("/api/v1/admin/categories", {
    params: {
      query: {
        limit: 100,
        sort: "sortOrder:asc",
      },
    },
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể tải danh sách danh mục."),
    );
  }

  return data.data;
}

/**
 * Creates a new catalog category (root or level-2 subcategory).
 */
export async function createCategory(
  payload: CreateCategoryDto,
): Promise<CategoryDto> {
  const { data, error } = await api.POST("/api/v1/categories", {
    body: payload,
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể tạo danh mục mới."),
    );
  }

  return data.data;
}

/**
 * Updates an existing catalog category.
 */
export async function updateCategory(
  id: string,
  payload: UpdateCategoryDto,
): Promise<CategoryDto> {
  const { data, error } = await api.PATCH("/api/v1/categories/{id}", {
    params: { path: { id } },
    body: payload,
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể cập nhật danh mục."),
    );
  }

  return data.data;
}

/**
 * Soft-deletes a catalog category when no child categories or products depend on it.
 */
export async function deleteCategory(id: string): Promise<void> {
  const { error } = await api.DELETE("/api/v1/categories/{id}", {
    params: { path: { id } },
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể xóa danh mục này."),
    );
  }
}

/**
 * Fetches paginated backoffice products (including inactive items).
 */
export async function fetchAdminProducts(
  params: AdminProductsQueryParams,
): Promise<{
  readonly items: ProductDto[];
  readonly total: number;
  readonly page: number;
  readonly totalPages: number;
}> {
  const { data, error } = await api.GET("/api/v1/admin/products", {
    params: {
      query: {
        q: params.q ?? undefined,
        categoryId: params.categoryId ?? undefined,
        isActive: params.isActive,
        page: params.page ?? 1,
        limit: params.limit ?? 20,
        sort: "createdAt:desc",
      },
    },
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể tải danh sách sản phẩm."),
    );
  }

  return {
    items: data.data,
    total: data.meta.total,
    page: data.meta.page,
    totalPages: data.meta.totalPages,
  };
}

/**
 * Creates a new catalog product.
 */
export async function createProduct(
  payload: CreateProductDto,
): Promise<ProductDto> {
  const { data, error } = await api.POST("/api/v1/products", {
    body: payload,
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể tạo sản phẩm mới."),
    );
  }

  return data.data;
}

/**
 * Updates an existing catalog product.
 */
export async function updateProduct(
  id: string,
  payload: UpdateProductDto,
): Promise<ProductDto> {
  const { data, error } = await api.PATCH("/api/v1/products/{id}", {
    params: { path: { id } },
    body: payload,
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể cập nhật sản phẩm."),
    );
  }

  return data.data;
}

/**
 * Soft-deletes a catalog product.
 */
export async function deleteProduct(id: string): Promise<void> {
  const { error } = await api.DELETE("/api/v1/products/{id}", {
    params: { path: { id } },
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể xóa sản phẩm này."),
    );
  }
}
