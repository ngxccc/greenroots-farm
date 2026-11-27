import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { API_ERROR_CODES, BatchStatus } from "@greenroots/shared";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { buildPaginationMeta } from "@/common/utils/api-response.util";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";
import { escapeLikePattern } from "@/common/utils/query.util";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
} from "@/database/database.module";
import {
  batches,
  categories,
  plots,
  products,
  seasons,
} from "@/database/schemas";
import {
  SELLABLE_BATCH_STATUSES,
  type ProductSortOption,
  type SellableBatchStatus,
} from "./catalog.constant";
import type { CatalogVisibilityScope } from "./catalog.interface";
import type {
  ActiveBatchTrace,
  AdminListProductsQuery,
  CreateProductInput,
  ListProductsQuery,
  ProductCategorySummary,
  ProductDetailProjection,
  ProductProjection,
  RescueProgress,
  UpdateProductInput,
} from "./dto";

const PRODUCT_COLUMNS = {
  id: products.id,
  categoryId: products.categoryId,
  name: products.name,
  slug: products.slug,
  description: products.description,
  storageInstructions: products.storageInstructions,
  basePrice: products.basePrice,
  salePrice: products.salePrice,
  unit: products.unit,
  imageUrls: products.imageUrls,
  isVietGap: products.isVietGap,
  isUsda: products.isUsda,
  isSubscriptionEligible: products.isSubscriptionEligible,
  isActive: products.isActive,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
} as const;

const PRODUCT_CATEGORY_SUMMARY_COLUMNS = {
  id: categories.id,
  name: categories.name,
  slug: categories.slug,
  parentId: categories.parentId,
} as const;

type ProductRow = Pick<
  typeof products.$inferSelect,
  keyof typeof PRODUCT_COLUMNS
>;

interface ProductJoinedRow {
  product: ProductRow;
  category: ProductCategorySummary;
  availableQuantity: string | number;
}

interface ActiveFefoBatchRow {
  batchCode: string;
  harvestDate: Date;
  expirationDate: Date;
  status: BatchStatus;
  initialQuantity: string | number;
  availableQuantity: string | number;
  plotCode: string;
  plotName: string;
}

// Keep sellable statuses and 0 as SQL literals so PostgreSQL proves predicate implication for batches_sellable_stock_idx.
const SELLABLE_BATCH_STATUS_SQL = sql.raw(
  SELLABLE_BATCH_STATUSES.map((status) => `'${status}'`).join(", "),
);

// Qualify products."id" explicitly because Drizzle strips table names from column refs in single-table queries, which would shadow against b.id inside the subquery.
export const LIVE_AVAILABLE_QUANTITY_EXPR = sql<string>`COALESCE((
  SELECT SUM(b.available_quantity)
  FROM ${batches} AS b
  WHERE b.product_id = ${products}."id"
    AND b.status IN (${SELLABLE_BATCH_STATUS_SQL})
    AND b.expiration_date > NOW()
    AND b.available_quantity > 0
), 0)`;

const EFFECTIVE_PRICE_EXPR = sql<number>`COALESCE(${products.salePrice}, ${products.basePrice})`;

const PRODUCT_SORT_EXPRESSIONS = new Map<ProductSortOption, SQL[]>([
  ["createdAt:desc", [desc(products.createdAt), desc(products.id)]],
  ["createdAt:asc", [asc(products.createdAt), desc(products.id)]],
  ["price:asc", [asc(EFFECTIVE_PRICE_EXPR), desc(products.id)]],
  ["price:desc", [desc(EFFECTIVE_PRICE_EXPR), desc(products.id)]],
  ["name:asc", [asc(products.name), desc(products.id)]],
  ["name:desc", [desc(products.name), desc(products.id)]],
]);

/**
 * Manages catalog products CRUD, effective-price filtering/sorting,
 * two-level category filtering, and category lock ordering.
 */
@Injectable()
export class ProductsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
  ) {}

  /**
   * Lists non-deleted products with pagination, certification/price/category filters, and sorting.
   */
  async listProducts(
    query: ListProductsQuery | AdminListProductsQuery,
    scope: CatalogVisibilityScope,
  ): Promise<{ items: ProductProjection[]; meta: PaginationMetaDto }> {
    const conditions: SQL[] = [
      isNull(products.deletedAt),
      isNull(categories.deletedAt),
    ];

    if (!scope.includeInactive) {
      conditions.push(eq(products.isActive, true));
      conditions.push(eq(categories.isActive, true));
    } else if ("isActive" in query && query.isActive !== undefined) {
      conditions.push(eq(products.isActive, query.isActive));
    }

    if (query.categoryId !== undefined || query.categorySlug !== undefined) {
      const targetCategoryId = await this.resolveFilterCategoryId(
        query.categoryId,
        query.categorySlug,
        scope,
      );

      if (!targetCategoryId) {
        return {
          items: [],
          meta: buildPaginationMeta(0, query.page, query.limit),
        };
      }

      const hierarchyCondition = or(
        eq(categories.id, targetCategoryId),
        eq(categories.parentId, targetCategoryId),
      );
      if (hierarchyCondition) {
        conditions.push(hierarchyCondition);
      }
    }

    if (query.q) {
      const pattern = `%${escapeLikePattern(query.q)}%`;
      const searchCondition = or(
        ilike(products.name, pattern),
        ilike(products.description, pattern),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    if (query.isVietGap !== undefined) {
      conditions.push(eq(products.isVietGap, query.isVietGap));
    }

    if (query.isUsda !== undefined) {
      conditions.push(eq(products.isUsda, query.isUsda));
    }

    if (query.isSubscriptionEligible !== undefined) {
      conditions.push(
        eq(products.isSubscriptionEligible, query.isSubscriptionEligible),
      );
    }

    if (query.minPriceVnd !== undefined) {
      conditions.push(sql`${EFFECTIVE_PRICE_EXPR} >= ${query.minPriceVnd}`);
    }

    if (query.maxPriceVnd !== undefined) {
      conditions.push(sql`${EFFECTIVE_PRICE_EXPR} <= ${query.maxPriceVnd}`);
    }

    const whereClause = and(...conditions);
    const offset = (query.page - 1) * query.limit;
    const orderByClauses = PRODUCT_SORT_EXPRESSIONS.get(query.sort) ?? [
      desc(products.createdAt),
      desc(products.id),
    ];

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(whereClause);

    const rows = await this.db
      .select({
        product: PRODUCT_COLUMNS,
        category: PRODUCT_CATEGORY_SUMMARY_COLUMNS,
        availableQuantity: LIVE_AVAILABLE_QUANTITY_EXPR,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(whereClause)
      .orderBy(...orderByClauses)
      .limit(query.limit)
      .offset(offset);

    const total = Number(totalRow?.total ?? 0);
    return {
      items: rows.map((row) => this.toProductProjection(row)),
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  }

  /**
   * Fetches an active, non-deleted product by slug (requiring an active category)
   * along with its deterministic FEFO active batch trace and near-expiry rescue summary.
   */
  async getPublicProductBySlug(slug: string): Promise<ProductDetailProjection> {
    const [row] = await this.db
      .select({
        product: PRODUCT_COLUMNS,
        category: PRODUCT_CATEGORY_SUMMARY_COLUMNS,
        availableQuantity: LIVE_AVAILABLE_QUANTITY_EXPR,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(
        and(
          eq(products.slug, slug),
          isNull(products.deletedAt),
          eq(products.isActive, true),
          isNull(categories.deletedAt),
          eq(categories.isActive, true),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODES.PRODUCT_NOT_FOUND,
        detail: MESSAGES.PRODUCTS.NOT_FOUND,
      });
    }

    const { activeBatchTrace, rescueProgress } =
      await this.findActiveFefoBatchSummary(row.product.id);

    return {
      ...this.toProductProjection(row),
      activeBatchTrace,
      rescueProgress,
    };
  }

  /**
   * Fetches a non-deleted product by UUIDv7 regardless of `isActive` for backoffice management.
   */
  async getAdminProductById(productId: string): Promise<ProductProjection> {
    const [row] = await this.db
      .select({
        product: PRODUCT_COLUMNS,
        category: PRODUCT_CATEGORY_SUMMARY_COLUMNS,
        availableQuantity: LIVE_AVAILABLE_QUANTITY_EXPR,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(
        and(
          eq(products.id, productId),
          isNull(products.deletedAt),
          isNull(categories.deletedAt),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODES.PRODUCT_NOT_FOUND,
        detail: MESSAGES.PRODUCTS.NOT_FOUND,
      });
    }

    return this.toProductProjection(row);
  }

  /**
   * Creates a product while locking its target category `FOR SHARE` to prevent concurrent category deletion.
   */
  async createProduct(input: CreateProductInput): Promise<ProductProjection> {
    try {
      const joined = await this.db.transaction(async (tx) => {
        // Lock the target category FOR SHARE before writing products (categories -> products order).
        const [category] = await tx
          .select(PRODUCT_CATEGORY_SUMMARY_COLUMNS)
          .from(categories)
          .where(
            and(
              eq(categories.id, input.categoryId),
              isNull(categories.deletedAt),
            ),
          )
          .limit(1)
          .for("share");

        if (!category) {
          throw new NotFoundException({
            code: API_ERROR_CODES.CATEGORY_NOT_FOUND,
            detail: MESSAGES.CATEGORIES.NOT_FOUND,
          });
        }

        const [created] = await tx
          .insert(products)
          .values({
            categoryId: input.categoryId,
            name: input.name,
            slug: input.slug,
            description: input.description ?? null,
            storageInstructions: input.storageInstructions ?? null,
            basePrice: input.basePriceVnd,
            salePrice: input.salePriceVnd ?? null,
            unit: input.unit,
            imageUrls: input.imageUrls ?? [],
            isVietGap: input.isVietGap,
            isUsda: input.isUsda,
            isSubscriptionEligible: input.isSubscriptionEligible,
            isActive: input.isActive,
          })
          .returning(PRODUCT_COLUMNS);

        if (!created) {
          throw new Error("Product insert returned no row.");
        }

        return { product: created, category, availableQuantity: 0 };
      });

      return this.toProductProjection(joined);
    } catch (error) {
      this.rethrowProductError(error);
      throw error;
    }
  }

  /**
   * Updates mutable fields on an active/non-deleted product while enforcing
   * cross-field `salePrice <= basePrice` invariants under a row lock.
   */
  async updateProduct(
    productId: string,
    input: UpdateProductInput,
  ): Promise<ProductProjection> {
    try {
      const joined = await this.db.transaction(async (tx) => {
        let lockedCategory: ProductCategorySummary | undefined;

        if (input.categoryId !== undefined) {
          const [category] = await tx
            .select(PRODUCT_CATEGORY_SUMMARY_COLUMNS)
            .from(categories)
            .where(
              and(
                eq(categories.id, input.categoryId),
                isNull(categories.deletedAt),
              ),
            )
            .limit(1)
            .for("share");

          if (!category) {
            throw new NotFoundException({
              code: API_ERROR_CODES.CATEGORY_NOT_FOUND,
              detail: MESSAGES.CATEGORIES.NOT_FOUND,
            });
          }

          lockedCategory = category;
        }

        const [existing] = await tx
          .select(PRODUCT_COLUMNS)
          .from(products)
          .where(and(eq(products.id, productId), isNull(products.deletedAt)))
          .limit(1)
          .for("update");

        if (!existing) {
          throw new NotFoundException({
            code: API_ERROR_CODES.PRODUCT_NOT_FOUND,
            detail: MESSAGES.PRODUCTS.NOT_FOUND,
          });
        }

        const effectiveBasePrice = input.basePriceVnd ?? existing.basePrice;
        const effectiveSalePrice =
          input.salePriceVnd !== undefined
            ? input.salePriceVnd
            : existing.salePrice;

        if (
          effectiveSalePrice !== null &&
          effectiveSalePrice > effectiveBasePrice
        ) {
          throw new UnprocessableEntityException({
            code: API_ERROR_CODES.PRODUCT_PRICE_INVALID,
            detail: MESSAGES.PRODUCTS.PRICE_INVALID,
          });
        }

        const patch: Partial<typeof products.$inferInsert> = {
          updatedAt: new Date(),
        };

        if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
        if (input.name !== undefined) patch.name = input.name;
        if (input.slug !== undefined) patch.slug = input.slug;
        if (input.description !== undefined) {
          patch.description = input.description;
        }
        if (input.storageInstructions !== undefined) {
          patch.storageInstructions = input.storageInstructions;
        }
        if (input.basePriceVnd !== undefined) {
          patch.basePrice = input.basePriceVnd;
        }
        if (input.salePriceVnd !== undefined) {
          patch.salePrice = input.salePriceVnd;
        }
        if (input.unit !== undefined) patch.unit = input.unit;
        if (input.imageUrls !== undefined) {
          patch.imageUrls = input.imageUrls ?? [];
        }
        if (input.isVietGap !== undefined) patch.isVietGap = input.isVietGap;
        if (input.isUsda !== undefined) patch.isUsda = input.isUsda;
        if (input.isSubscriptionEligible !== undefined) {
          patch.isSubscriptionEligible = input.isSubscriptionEligible;
        }
        if (input.isActive !== undefined) patch.isActive = input.isActive;

        const [updated] = await tx
          .update(products)
          .set(patch)
          .where(and(eq(products.id, productId), isNull(products.deletedAt)))
          .returning(PRODUCT_COLUMNS);

        if (!updated) {
          throw new NotFoundException({
            code: API_ERROR_CODES.PRODUCT_NOT_FOUND,
            detail: MESSAGES.PRODUCTS.NOT_FOUND,
          });
        }

        if (!lockedCategory) {
          const [category] = await tx
            .select(PRODUCT_CATEGORY_SUMMARY_COLUMNS)
            .from(categories)
            .where(eq(categories.id, updated.categoryId))
            .limit(1);

          if (!category) {
            throw new NotFoundException({
              code: API_ERROR_CODES.CATEGORY_NOT_FOUND,
              detail: MESSAGES.CATEGORIES.NOT_FOUND,
            });
          }

          lockedCategory = category;
        }

        const [stockRow] = await tx
          .select({
            availableQuantity: LIVE_AVAILABLE_QUANTITY_EXPR,
          })
          .from(products)
          .where(eq(products.id, updated.id))
          .limit(1);

        return {
          product: updated,
          category: lockedCategory,
          availableQuantity: stockRow?.availableQuantity ?? 0,
        };
      });

      return this.toProductProjection(joined);
    } catch (error) {
      this.rethrowProductError(error);
      throw error;
    }
  }

  /**
   * Soft-deletes a product while leaving historical batches and order items intact.
   */
  async deleteProduct(productId: string): Promise<void> {
    const now = new Date();
    const [deleted] = await this.db
      .update(products)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(products.id, productId), isNull(products.deletedAt)))
      .returning({ id: products.id });

    if (!deleted) {
      throw new NotFoundException({
        code: API_ERROR_CODES.PRODUCT_NOT_FOUND,
        detail: MESSAGES.PRODUCTS.NOT_FOUND,
      });
    }
  }

  private async resolveFilterCategoryId(
    categoryId: string | undefined,
    categorySlug: string | undefined,
    scope: CatalogVisibilityScope,
  ): Promise<string | null> {
    const lookupConditions: SQL[] = [isNull(categories.deletedAt)];

    if (!scope.includeInactive) {
      lookupConditions.push(eq(categories.isActive, true));
    }

    if (categoryId !== undefined) {
      lookupConditions.push(eq(categories.id, categoryId));
    } else if (categorySlug !== undefined) {
      lookupConditions.push(eq(categories.slug, categorySlug));
    } else {
      return null;
    }

    const [category] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(and(...lookupConditions))
      .limit(1);

    return category?.id ?? null;
  }

  private async findActiveFefoBatchSummary(productId: string): Promise<{
    activeBatchTrace: ActiveBatchTrace | null;
    rescueProgress: RescueProgress | null;
  }> {
    // Intentionally omit plots.deletedAt IS NULL so historical plot provenance remains intact if a plot is archived post-harvest (INV-PROD-8).
    const [batchRow] = await this.db
      .select({
        batchCode: batches.batchCode,
        harvestDate: batches.harvestDate,
        expirationDate: batches.expirationDate,
        status: batches.status,
        initialQuantity: batches.initialQuantity,
        availableQuantity: batches.availableQuantity,
        plotCode: plots.plotCode,
        plotName: plots.name,
      })
      .from(batches)
      .innerJoin(seasons, eq(batches.seasonId, seasons.id))
      .innerJoin(plots, eq(seasons.plotId, plots.id))
      .where(
        and(
          eq(batches.productId, productId),
          sql`${batches.status} IN (${SELLABLE_BATCH_STATUS_SQL})`,
          sql`${batches.expirationDate} > NOW()`,
          sql`${batches.availableQuantity} > 0`,
        ),
      )
      .orderBy(asc(batches.expirationDate), asc(batches.id))
      .limit(1);

    if (!batchRow) {
      return {
        activeBatchTrace: null,
        rescueProgress: null,
      };
    }

    return {
      activeBatchTrace: {
        batchCode: batchRow.batchCode,
        harvestDate: batchRow.harvestDate.toISOString(),
        expirationDate: batchRow.expirationDate.toISOString(),
        status: batchRow.status as SellableBatchStatus,
        plotCode: batchRow.plotCode,
        plotName: batchRow.plotName,
      },
      rescueProgress: this.toRescueProgress(batchRow),
    };
  }

  private toRescueProgress(
    batchRow: ActiveFefoBatchRow,
  ): RescueProgress | null {
    if (batchRow.status !== BatchStatus.NEAR_EXPIRY) {
      return null;
    }

    const initialQuantity = Number(batchRow.initialQuantity);
    const availableQuantity = Number(batchRow.availableQuantity);
    const rawPercent =
      initialQuantity > 0
        ? Math.round(
            ((initialQuantity - availableQuantity) / initialQuantity) * 100,
          )
        : 0;

    return {
      expiresAt: batchRow.expirationDate.toISOString(),
      claimedPercent: Math.min(100, Math.max(0, rawPercent)),
    };
  }

  private toProductProjection({
    product,
    category,
    availableQuantity,
  }: ProductJoinedRow): ProductProjection {
    return {
      id: product.id,
      categoryId: product.categoryId,
      category,
      name: product.name,
      slug: product.slug,
      description: product.description,
      storageInstructions: product.storageInstructions,
      basePriceVnd: product.basePrice,
      salePriceVnd: product.salePrice,
      availableQuantity: Number(availableQuantity),
      unit: product.unit,
      imageUrls: product.imageUrls ?? [],
      isVietGap: product.isVietGap,
      isUsda: product.isUsda,
      isSubscriptionEligible: product.isSubscriptionEligible,
      isActive: product.isActive,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  private rethrowProductError(error: unknown): void {
    const dbError = extractDatabaseErrorDetails(error);

    if (dbError.code === PG_ERROR_CODE.UNIQUE_VIOLATION) {
      throw new ConflictException({
        code: API_ERROR_CODES.PRODUCT_SLUG_ALREADY_EXISTS,
        detail: MESSAGES.PRODUCTS.SLUG_ALREADY_EXISTS,
      });
    }

    if (dbError.code === PG_ERROR_CODE.CHECK_VIOLATION) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.PRODUCT_PRICE_INVALID,
        detail: MESSAGES.PRODUCTS.PRICE_INVALID,
      });
    }
  }
}
