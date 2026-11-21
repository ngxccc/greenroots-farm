import { randomBytes } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
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
  type SQL,
} from "drizzle-orm";
import {
  API_ERROR_CODES,
  BUSINESS_RULES,
  BatchStatus,
} from "@greenroots/shared";
import { env, resolvePublicStorefrontOrigin } from "@/common/config/env.config";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import { TIME_IN_MS } from "@/common/constants/time.constant";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { buildPaginationMeta } from "@/common/utils/api-response.util";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";
import { escapeLikePattern } from "@/common/utils/query.util";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
} from "@/database/database.module";
import { batches, products, seasons } from "@/database/schemas";
import { FarmSettingsService } from "@/modules/farms/farm-settings.service";
import { TraceCacheService } from "@/modules/farms/trace-cache.service";
import type {
  BatchProductSummary,
  BatchProjection,
  BatchQrLabelProjection,
  BatchSeasonSummary,
  CreateBatchInput,
  ListBatchesQuery,
} from "./dto";
import { CROCKFORD_BASE32_ALPHABET } from "@/common/constants/encoding.constant";
import { VIETNAM_TIMEZONE } from "@/common/constants/time.constant";
import {
  ALLOWED_BATCH_INTAKE_SEASON_STATUSES,
  BATCH_CODE_MAX_GENERATION_ATTEMPTS,
  BATCH_CODE_RANDOM_LENGTH,
  type BatchSortOption,
} from "./inventory.constant";

const BATCH_COLUMNS = {
  id: batches.id,
  batchCode: batches.batchCode,
  productId: batches.productId,
  seasonId: batches.seasonId,
  harvestDate: batches.harvestDate,
  expirationDate: batches.expirationDate,
  initialQuantity: batches.initialQuantity,
  availableQuantity: batches.availableQuantity,
  status: batches.status,
  createdAt: batches.createdAt,
  updatedAt: batches.updatedAt,
} as const;

const BATCH_PRODUCT_SUMMARY_COLUMNS = {
  id: products.id,
  name: products.name,
  slug: products.slug,
  unit: products.unit,
} as const;

const BATCH_SEASON_SUMMARY_COLUMNS = {
  id: seasons.id,
  seasonName: seasons.seasonName,
  plotId: seasons.plotId,
} as const;

type BatchRow = Pick<typeof batches.$inferSelect, keyof typeof BATCH_COLUMNS>;

interface BatchJoinedRow {
  batch: BatchRow;
  product: BatchProductSummary;
  season: BatchSeasonSummary;
}

const BATCH_SORT_EXPRESSIONS = new Map<BatchSortOption, SQL[]>([
  ["createdAt:desc", [desc(batches.createdAt), desc(batches.id)]],
  ["createdAt:asc", [asc(batches.createdAt), desc(batches.id)]],
  ["expirationDate:asc", [asc(batches.expirationDate), desc(batches.id)]],
  ["expirationDate:desc", [desc(batches.expirationDate), desc(batches.id)]],
  ["harvestDate:desc", [desc(batches.harvestDate), desc(batches.id)]],
  ["harvestDate:asc", [asc(batches.harvestDate), desc(batches.id)]],
]);

const VN_CALENDAR_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: VIETNAM_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Manages harvested batch intake, server-side batch code generation,
 * instant-based shelf-life classification, and inventory listing queries.
 */
@Injectable()
export class BatchesService {
  private readonly logger = new Logger(BatchesService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
    private readonly farmSettingsService: FarmSettingsService,
    private readonly traceCacheService: TraceCacheService,
  ) {}

  /**
   * Creates a harvested inventory batch with server-generated `batchCode`,
   * computed `expirationDate`, initial stock equality, and threshold-derived status.
   *
   * @param input Validated batch intake payload.
   * @returns Created batch projection including nested product and season summaries.
   */
  async createBatch(input: CreateBatchInput): Promise<BatchProjection> {
    const now = new Date();
    const harvestDate = new Date(input.harvestDate);

    if (harvestDate.getTime() > now.getTime()) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.BATCH_HARVEST_DATE_INVALID,
        detail: MESSAGES.BATCHES.HARVEST_IN_FUTURE,
      });
    }

    const expirationDate = new Date(
      harvestDate.getTime() + input.shelfLifeDays * TIME_IN_MS.DAY,
    );

    if (expirationDate.getTime() <= now.getTime()) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.BATCH_EXPIRED_AT_INTAKE,
        detail: MESSAGES.BATCHES.EXPIRED_AT_INTAKE,
      });
    }

    const hoursThreshold = await this.resolveHoursThreshold();
    const remainingMs = expirationDate.getTime() - now.getTime();
    const initialStatus =
      remainingMs < hoursThreshold * TIME_IN_MS.HOUR
        ? BatchStatus.NEAR_EXPIRY
        : BatchStatus.IN_STOCK;

    const harvestCalendarDateVn = this.formatCalendarDateVn(harvestDate);
    const yyyymmdd = harvestCalendarDateVn.replaceAll("-", "");
    const quantityValue = input.initialQuantity.toFixed(2);

    let createdRow: BatchJoinedRow | undefined;

    for (
      let attempt = 1;
      attempt <= BATCH_CODE_MAX_GENERATION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        createdRow = await this.db.transaction(async (tx) => {
          // Lock products before seasons in fixed order to prevent cross-module deadlocks.
          const [product] = await tx
            .select(BATCH_PRODUCT_SUMMARY_COLUMNS)
            .from(products)
            .where(
              and(eq(products.id, input.productId), isNull(products.deletedAt)),
            )
            .limit(1)
            .for("share");

          if (!product) {
            throw new NotFoundException({
              code: API_ERROR_CODES.PRODUCT_NOT_FOUND,
              detail: MESSAGES.PRODUCTS.NOT_FOUND,
            });
          }

          const [season] = await tx
            .select({
              id: seasons.id,
              seasonName: seasons.seasonName,
              plotId: seasons.plotId,
              startDate: seasons.startDate,
              status: seasons.status,
            })
            .from(seasons)
            .where(eq(seasons.id, input.seasonId))
            .limit(1)
            .for("share");

          if (!season) {
            throw new NotFoundException({
              code: API_ERROR_CODES.SEASON_NOT_FOUND,
              detail: MESSAGES.SEASONS.NOT_FOUND,
            });
          }

          if (!ALLOWED_BATCH_INTAKE_SEASON_STATUSES.includes(season.status)) {
            throw new UnprocessableEntityException({
              code: API_ERROR_CODES.BATCH_SEASON_STATUS_INVALID,
              detail: MESSAGES.BATCHES.SEASON_STATUS_INVALID,
            });
          }

          if (harvestCalendarDateVn < season.startDate) {
            throw new UnprocessableEntityException({
              code: API_ERROR_CODES.BATCH_HARVEST_DATE_INVALID,
              detail: MESSAGES.BATCHES.HARVEST_BEFORE_SEASON_START,
            });
          }

          const batchCode = this.buildBatchCode(yyyymmdd, product.slug);

          const [inserted] = await tx
            .insert(batches)
            .values({
              batchCode,
              productId: product.id,
              seasonId: season.id,
              harvestDate,
              expirationDate,
              initialQuantity: quantityValue,
              availableQuantity: quantityValue,
              status: initialStatus,
            })
            .returning(BATCH_COLUMNS);

          if (!inserted) {
            throw new Error("Failed to insert batch record.");
          }

          return {
            batch: inserted,
            product,
            season: {
              id: season.id,
              seasonName: season.seasonName,
              plotId: season.plotId,
            },
          };
        });

        break;
      } catch (error) {
        if (this.isBatchCodeUniqueViolation(error)) {
          if (attempt < BATCH_CODE_MAX_GENERATION_ATTEMPTS) {
            this.logger.warn(
              `Batch code collision on attempt ${attempt}; retrying with a new suffix.`,
            );
            continue;
          }

          throw new ConflictException({
            code: API_ERROR_CODES.CONCURRENCY_CONFLICT,
            detail: MESSAGES.BATCHES.CODE_GENERATION_EXHAUSTED,
          });
        }

        throw error;
      }
    }

    if (!createdRow) {
      throw new ConflictException({
        code: API_ERROR_CODES.CONCURRENCY_CONFLICT,
        detail: MESSAGES.BATCHES.CODE_GENERATION_EXHAUSTED,
      });
    }

    // Clear any 30s negative-cache marker after commit; fail-open per ADR-0024.
    await this.traceCacheService.invalidateByBatchCodes([
      createdRow.batch.batchCode,
    ]);

    return this.toProjection(createdRow);
  }

  /**
   * Lists batches with pagination, product/season/status/code filters, and whitelisted sorting.
   *
   * @param query Validated query parameters.
   * @returns Paginated batch projections and metadata.
   */
  async listBatches(
    query: ListBatchesQuery,
  ): Promise<{ items: BatchProjection[]; meta: PaginationMetaDto }> {
    const conditions: SQL[] = [];

    if (query.productId !== undefined) {
      conditions.push(eq(batches.productId, query.productId));
    }

    if (query.seasonId !== undefined) {
      conditions.push(eq(batches.seasonId, query.seasonId));
    }

    if (query.status !== undefined) {
      conditions.push(eq(batches.status, query.status));
    }

    if (query.search !== undefined) {
      const pattern = `%${escapeLikePattern(query.search)}%`;
      conditions.push(ilike(batches.batchCode, pattern));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const orderBy =
      BATCH_SORT_EXPRESSIONS.get(query.sort) ??
      BATCH_SORT_EXPRESSIONS.get("createdAt:desc")!;
    const offset = (query.page - 1) * query.limit;

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(batches)
      .innerJoin(products, eq(batches.productId, products.id))
      .innerJoin(seasons, eq(batches.seasonId, seasons.id))
      .where(whereClause);

    const rows = await this.db
      .select({
        batch: BATCH_COLUMNS,
        product: BATCH_PRODUCT_SUMMARY_COLUMNS,
        season: BATCH_SEASON_SUMMARY_COLUMNS,
      })
      .from(batches)
      .innerJoin(products, eq(batches.productId, products.id))
      .innerJoin(seasons, eq(batches.seasonId, seasons.id))
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(query.limit)
      .offset(offset);

    const total = Number(totalRow?.total ?? 0);

    return {
      items: rows.map((row) =>
        this.toProjection({
          batch: row.batch,
          product: row.product,
          season: row.season,
        }),
      ),
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  }

  /**
   * Retrieves a single inventory batch by UUIDv7 identifier.
   *
   * @param id Batch UUIDv7 identifier.
   * @returns Batch projection with nested product and season summaries.
   */
  async getBatchById(id: string): Promise<BatchProjection> {
    const [row] = await this.db
      .select({
        batch: BATCH_COLUMNS,
        product: BATCH_PRODUCT_SUMMARY_COLUMNS,
        season: BATCH_SEASON_SUMMARY_COLUMNS,
      })
      .from(batches)
      .innerJoin(products, eq(batches.productId, products.id))
      .innerJoin(seasons, eq(batches.seasonId, seasons.id))
      .where(eq(batches.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODES.BATCH_NOT_FOUND,
        detail: MESSAGES.BATCHES.NOT_FOUND,
      });
    }

    return this.toProjection(row);
  }

  /**
   * Builds a deterministic QR label payload and public storefront trace URL for an existing batch.
   *
   * @param id Batch UUIDv7 identifier.
   * @returns Deterministic QR label payload independent of mutable stock or batch lifecycle status.
   */
  async getBatchQrLabel(id: string): Promise<BatchQrLabelProjection> {
    const [row] = await this.db
      .select({
        batchCode: batches.batchCode,
        harvestDate: batches.harvestDate,
        expirationDate: batches.expirationDate,
        productName: products.name,
        unit: products.unit,
      })
      .from(batches)
      .innerJoin(products, eq(batches.productId, products.id))
      .where(eq(batches.id, id))
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODES.BATCH_NOT_FOUND,
        detail: MESSAGES.BATCHES.NOT_FOUND,
      });
    }

    const origin = resolvePublicStorefrontOrigin(
      env.STOREFRONT_URL,
      env.NODE_ENV,
    );
    const traceUrl = new URL(
      `/trace/${encodeURIComponent(row.batchCode)}`,
      origin,
    ).toString();

    return {
      batchCode: row.batchCode,
      traceUrl,
      labelPayload: {
        batchCode: row.batchCode,
        productName: row.productName,
        unit: row.unit,
        harvestDate: row.harvestDate.toISOString(),
        expirationDate: row.expirationDate.toISOString(),
        qrValue: traceUrl,
      },
    };
  }

  /**
   * Generates a server-side batch code formatted as `BATCH-<YYYYMMDD>-<PRODUCT_TAG>-<RAND6>`.
   */
  protected buildBatchCode(yyyymmdd: string, productSlug: string): string {
    const cleanTag = productSlug
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
    const productTag = cleanTag.length > 0 ? cleanTag : "ITEM";
    const suffix = this.generateRandomCodeSuffix();

    return `BATCH-${yyyymmdd}-${productTag}-${suffix}`;
  }

  /**
   * Generates a 6-character Crockford Base32 random suffix with zero modulo bias.
   */
  protected generateRandomCodeSuffix(): string {
    const bytes = randomBytes(BATCH_CODE_RANDOM_LENGTH);
    let suffix = "";
    for (const byte of bytes) {
      suffix += CROCKFORD_BASE32_ALPHABET[byte % 32];
    }
    return suffix;
  }

  private async resolveHoursThreshold(): Promise<number> {
    try {
      const settings = await this.farmSettingsService.getSettings();
      const hoursThreshold = settings.flashSaleConfig.hoursThreshold;

      if (!Number.isFinite(hoursThreshold) || hoursThreshold <= 0) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.FARM_FLASH_SALE_CONFIG_INVALID,
          detail: MESSAGES.FARMS.FLASH_SALE_CONFIG_INVALID,
        });
      }

      return hoursThreshold;
    } catch (error) {
      if (error instanceof NotFoundException && env.NODE_ENV !== "production") {
        this.logger.warn(
          `Farm settings not found in ${env.NODE_ENV}; falling back to default ${BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD}h threshold.`,
        );
        return BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD;
      }

      throw error;
    }
  }

  private formatCalendarDateVn(date: Date): string {
    return VN_CALENDAR_FORMATTER.format(date);
  }

  private isBatchCodeUniqueViolation(error: unknown): boolean {
    const details = extractDatabaseErrorDetails(error);
    return (
      details.isDatabaseError &&
      details.code === PG_ERROR_CODE.UNIQUE_VIOLATION &&
      details.constraint === "batches_batch_code_uidx"
    );
  }

  private toProjection(row: BatchJoinedRow): BatchProjection {
    return {
      id: row.batch.id,
      batchCode: row.batch.batchCode,
      productId: row.batch.productId,
      seasonId: row.batch.seasonId,
      product: row.product,
      season: row.season,
      harvestDate: row.batch.harvestDate.toISOString(),
      expirationDate: row.batch.expirationDate.toISOString(),
      initialQuantity: Number(row.batch.initialQuantity),
      availableQuantity: Number(row.batch.availableQuantity),
      status: row.batch.status,
      createdAt: row.batch.createdAt.toISOString(),
      updatedAt: row.batch.updatedAt.toISOString(),
    };
  }
}
