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
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
} from "drizzle-orm";
import { API_ERROR_CODES } from "@greenroots/shared";
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
import { categories, products } from "@/database/schemas";
import type {
  CategorySortOption,
  CatalogVisibilityScope,
} from "./catalog.interface";
import type {
  AdminListCategoriesQuery,
  CategoryProjection,
  CreateCategoryInput,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from "./dto";

const CATEGORY_COLUMNS = {
  id: categories.id,
  name: categories.name,
  slug: categories.slug,
  description: categories.description,
  parentId: categories.parentId,
  sortOrder: categories.sortOrder,
  isActive: categories.isActive,
  createdAt: categories.createdAt,
  updatedAt: categories.updatedAt,
} as const;

type CategoryRow = Pick<
  typeof categories.$inferSelect,
  keyof typeof CATEGORY_COLUMNS
>;

const CATEGORY_SORT_EXPRESSIONS = new Map<CategorySortOption, SQL[]>([
  [
    "sortOrder:asc",
    [asc(categories.sortOrder), asc(categories.name), asc(categories.id)],
  ],
  [
    "sortOrder:desc",
    [desc(categories.sortOrder), asc(categories.name), asc(categories.id)],
  ],
  ["name:asc", [asc(categories.name), asc(categories.id)]],
  ["name:desc", [desc(categories.name), asc(categories.id)]],
  ["createdAt:desc", [desc(categories.createdAt), desc(categories.id)]],
]);

/**
 * Manages catalog categories CRUD, two-level hierarchy constraints,
 * soft-delete dependency guards, and public/admin visibility scopes.
 */
@Injectable()
export class CategoriesService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
  ) {}

  /**
   * Lists non-deleted categories with pagination, filtering, and whitelisted sorting.
   */
  async listCategories(
    query: ListCategoriesQuery | AdminListCategoriesQuery,
    scope: CatalogVisibilityScope,
  ): Promise<{ items: CategoryProjection[]; meta: PaginationMetaDto }> {
    const conditions: SQL[] = [isNull(categories.deletedAt)];

    if (!scope.includeInactive) {
      conditions.push(eq(categories.isActive, true));
    } else if ("isActive" in query && query.isActive !== undefined) {
      conditions.push(eq(categories.isActive, query.isActive));
    }

    if (query.q) {
      const pattern = `%${escapeLikePattern(query.q)}%`;
      const searchCondition = or(
        ilike(categories.name, pattern),
        ilike(categories.description, pattern),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    if (query.parentId !== undefined) {
      conditions.push(eq(categories.parentId, query.parentId));
    } else if (query.rootOnly === true) {
      conditions.push(isNull(categories.parentId));
    } else if (query.rootOnly === false) {
      conditions.push(isNotNull(categories.parentId));
    }

    const whereClause = and(...conditions);
    const offset = (query.page - 1) * query.limit;
    const orderByClauses = CATEGORY_SORT_EXPRESSIONS.get(query.sort) ?? [
      asc(categories.sortOrder),
      asc(categories.name),
      asc(categories.id),
    ];

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(categories)
      .where(whereClause);

    const rows = await this.db
      .select(CATEGORY_COLUMNS)
      .from(categories)
      .where(whereClause)
      .orderBy(...orderByClauses)
      .limit(query.limit)
      .offset(offset);

    const total = Number(totalRow?.total ?? 0);
    return {
      items: rows.map((row) => this.toCategoryProjection(row)),
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  }

  /**
   * Fetches a single non-deleted category by UUIDv7 for backoffice management.
   */
  async getAdminCategoryById(categoryId: string): Promise<CategoryProjection> {
    const [row] = await this.db
      .select(CATEGORY_COLUMNS)
      .from(categories)
      .where(and(eq(categories.id, categoryId), isNull(categories.deletedAt)))
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODES.CATEGORY_NOT_FOUND,
        detail: MESSAGES.CATEGORIES.NOT_FOUND,
      });
    }

    return this.toCategoryProjection(row);
  }

  /**
   * Creates a category while enforcing two-level hierarchy and active uniqueness.
   */
  async createCategory(
    input: CreateCategoryInput,
  ): Promise<CategoryProjection> {
    try {
      const created = await this.db.transaction(async (tx) => {
        if (input.parentId) {
          const [parent] = await tx
            .select({ id: categories.id, parentId: categories.parentId })
            .from(categories)
            .where(
              and(
                eq(categories.id, input.parentId),
                isNull(categories.deletedAt),
              ),
            )
            .limit(1)
            .for("update");

          if (!parent) {
            throw new NotFoundException({
              code: API_ERROR_CODES.CATEGORY_NOT_FOUND,
              detail: MESSAGES.CATEGORIES.NOT_FOUND,
            });
          }

          if (parent.parentId !== null) {
            throw new UnprocessableEntityException({
              code: API_ERROR_CODES.CATEGORY_HIERARCHY_INVALID,
              detail: MESSAGES.CATEGORIES.HIERARCHY_INVALID,
            });
          }
        }

        const [inserted] = await tx
          .insert(categories)
          .values({
            name: input.name,
            slug: input.slug,
            description: input.description ?? null,
            parentId: input.parentId ?? null,
            sortOrder: input.sortOrder,
            isActive: input.isActive,
          })
          .returning(CATEGORY_COLUMNS);

        if (!inserted) {
          throw new Error("Category insert returned no row.");
        }

        return inserted;
      });

      return this.toCategoryProjection(created);
    } catch (error) {
      this.rethrowCategoryConflict(error);
      throw error;
    }
  }

  /**
   * Updates mutable category fields while preserving two-level hierarchy and uniqueness.
   */
  async updateCategory(
    categoryId: string,
    input: UpdateCategoryInput,
  ): Promise<CategoryProjection> {
    if (input.parentId === categoryId) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.CATEGORY_HIERARCHY_INVALID,
        detail: MESSAGES.CATEGORIES.HIERARCHY_INVALID,
      });
    }

    try {
      const updated = await this.db.transaction(async (tx) => {
        // Lock involved category rows in ascending UUID order so concurrent re-parenting cannot deadlock.
        const lockIds =
          typeof input.parentId === "string"
            ? [...new Set([categoryId, input.parentId])].sort()
            : [categoryId];

        const lockedRows = await tx
          .select({ id: categories.id, parentId: categories.parentId })
          .from(categories)
          .where(
            and(inArray(categories.id, lockIds), isNull(categories.deletedAt)),
          )
          .orderBy(asc(categories.id))
          .for("update");

        const targetRow = lockedRows.find((row) => row.id === categoryId);
        if (!targetRow) {
          throw new NotFoundException({
            code: API_ERROR_CODES.CATEGORY_NOT_FOUND,
            detail: MESSAGES.CATEGORIES.NOT_FOUND,
          });
        }

        if (typeof input.parentId === "string") {
          const parentRow = lockedRows.find((row) => row.id === input.parentId);
          if (!parentRow) {
            throw new NotFoundException({
              code: API_ERROR_CODES.CATEGORY_NOT_FOUND,
              detail: MESSAGES.CATEGORIES.NOT_FOUND,
            });
          }

          if (parentRow.parentId !== null) {
            throw new UnprocessableEntityException({
              code: API_ERROR_CODES.CATEGORY_HIERARCHY_INVALID,
              detail: MESSAGES.CATEGORIES.HIERARCHY_INVALID,
            });
          }

          const [existingChild] = await tx
            .select({ id: categories.id })
            .from(categories)
            .where(
              and(
                eq(categories.parentId, categoryId),
                isNull(categories.deletedAt),
              ),
            )
            .limit(1);

          if (existingChild) {
            throw new UnprocessableEntityException({
              code: API_ERROR_CODES.CATEGORY_HIERARCHY_INVALID,
              detail: MESSAGES.CATEGORIES.HIERARCHY_INVALID,
            });
          }
        }

        const patch: Partial<typeof categories.$inferInsert> = {
          updatedAt: new Date(),
        };

        if (input.name !== undefined) patch.name = input.name;
        if (input.slug !== undefined) patch.slug = input.slug;
        if (input.description !== undefined) {
          patch.description = input.description;
        }
        if (input.parentId !== undefined) patch.parentId = input.parentId;
        if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
        if (input.isActive !== undefined) patch.isActive = input.isActive;

        const [saved] = await tx
          .update(categories)
          .set(patch)
          .where(
            and(eq(categories.id, categoryId), isNull(categories.deletedAt)),
          )
          .returning(CATEGORY_COLUMNS);

        if (!saved) {
          throw new NotFoundException({
            code: API_ERROR_CODES.CATEGORY_NOT_FOUND,
            detail: MESSAGES.CATEGORIES.NOT_FOUND,
          });
        }

        return saved;
      });

      return this.toCategoryProjection(updated);
    } catch (error) {
      this.rethrowCategoryConflict(error);
      throw error;
    }
  }

  /**
   * Soft-deletes a category after verifying no live child categories or products depend on it.
   */
  async deleteCategory(categoryId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Lock the category row first (categories -> products) to serialize against concurrent product assignments.
      const [lockedCategory] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.id, categoryId), isNull(categories.deletedAt)))
        .limit(1)
        .for("update");

      if (!lockedCategory) {
        throw new NotFoundException({
          code: API_ERROR_CODES.CATEGORY_NOT_FOUND,
          detail: MESSAGES.CATEGORIES.NOT_FOUND,
        });
      }

      const [childCategory] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.parentId, categoryId),
            isNull(categories.deletedAt),
          ),
        )
        .limit(1);

      if (childCategory) {
        throw new ConflictException({
          code: API_ERROR_CODES.CATEGORY_HAS_CHILDREN,
          detail: MESSAGES.CATEGORIES.HAS_CHILDREN,
        });
      }

      const [linkedProduct] = await tx
        .select({ id: products.id })
        .from(products)
        .where(
          and(eq(products.categoryId, categoryId), isNull(products.deletedAt)),
        )
        .limit(1);

      if (linkedProduct) {
        throw new ConflictException({
          code: API_ERROR_CODES.CATEGORY_HAS_PRODUCTS,
          detail: MESSAGES.CATEGORIES.HAS_PRODUCTS,
        });
      }

      const now = new Date();
      await tx
        .update(categories)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(categories.id, categoryId));
    });
  }

  private toCategoryProjection(row: CategoryRow): CategoryProjection {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      parentId: row.parentId,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private rethrowCategoryConflict(error: unknown): void {
    const dbError = extractDatabaseErrorDetails(error);
    if (dbError.code === PG_ERROR_CODE.UNIQUE_VIOLATION) {
      if (dbError.constraint === "categories_slug_uidx") {
        throw new ConflictException({
          code: API_ERROR_CODES.CATEGORY_SLUG_ALREADY_EXISTS,
          detail: MESSAGES.CATEGORIES.SLUG_ALREADY_EXISTS,
        });
      }

      throw new ConflictException({
        code: API_ERROR_CODES.CATEGORY_NAME_ALREADY_EXISTS,
        detail: MESSAGES.CATEGORIES.NAME_ALREADY_EXISTS,
      });
    }
  }
}
