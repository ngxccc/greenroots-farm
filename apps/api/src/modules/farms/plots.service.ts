import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  type SQL,
} from "drizzle-orm";
import { API_ERROR_CODES, SeasonStatus } from "@greenroots/shared";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { buildPaginationMeta } from "@/common/utils/api-response.util";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
} from "@/database/database.module";
import { farms, plots, seasons } from "@/database/schemas";
import type {
  CreatePlotInput,
  ListPlotsQuery,
  PlotProjection,
  UpdatePlotInput,
} from "./dto";
import type { PlotSortOption } from "./farms.interface";
import { escapeLikePattern } from "./farms.utils";
import { TraceCacheService } from "./trace-cache.service";

const PLOT_COLUMNS = {
  id: plots.id,
  farmId: plots.farmId,
  plotCode: plots.plotCode,
  name: plots.name,
  areaSqm: plots.areaSqm,
  soilTestResult: plots.soilTestResult,
  waterTestResult: plots.waterTestResult,
  createdAt: plots.createdAt,
  updatedAt: plots.updatedAt,
} as const;

type PlotRow = Pick<typeof plots.$inferSelect, keyof typeof PLOT_COLUMNS>;

const PLOT_SORT_EXPRESSIONS = new Map<PlotSortOption, SQL[]>([
  ["createdAt:desc", [desc(plots.createdAt), desc(plots.id)]],
  ["createdAt:asc", [asc(plots.createdAt), desc(plots.id)]],
  ["plotCode:asc", [asc(plots.plotCode), desc(plots.id)]],
  ["plotCode:desc", [desc(plots.plotCode), desc(plots.id)]],
  ["areaSqm:asc", [asc(plots.areaSqm), desc(plots.id)]],
  ["areaSqm:desc", [desc(plots.areaSqm), desc(plots.id)]],
]);

const BLOCKING_SEASON_STATUSES = [
  SeasonStatus.PLANNING,
  SeasonStatus.ACTIVE,
] as const;

/**
 * Manages cultivation plots CRUD, soft-delete filtering, active-code uniqueness,
 * and active-season deletion protection.
 */
@Injectable()
export class PlotsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
    private readonly traceCacheService: TraceCacheService,
  ) {}

  /**
   * Lists active (non-soft-deleted) plots with pagination, search, and whitelisted sorting.
   */
  async listPlots(
    query: ListPlotsQuery,
  ): Promise<{ items: PlotProjection[]; meta: PaginationMetaDto }> {
    const conditions: SQL[] = [isNull(plots.deletedAt)];

    if (query.q) {
      const pattern = `%${escapeLikePattern(query.q)}%`;
      const searchCond = or(
        ilike(plots.plotCode, pattern),
        ilike(plots.name, pattern),
      );
      if (searchCond) {
        conditions.push(searchCond);
      }
    }

    const whereClause = and(...conditions);
    const offset = (query.page - 1) * query.limit;
    const orderByClauses = PLOT_SORT_EXPRESSIONS.get(query.sort) ?? [
      desc(plots.createdAt),
      desc(plots.id),
    ];

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(plots)
      .where(whereClause);

    const rows = await this.db
      .select(PLOT_COLUMNS)
      .from(plots)
      .where(whereClause)
      .orderBy(...orderByClauses)
      .limit(query.limit)
      .offset(offset);

    const total = Number(totalRow?.total ?? 0);
    return {
      items: rows.map((row) => this.toPlotProjection(row)),
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  }

  /**
   * Fetches a single active plot by UUIDv7, excluding soft-deleted rows.
   */
  async getPlotById(plotId: string): Promise<PlotProjection> {
    const [row] = await this.db
      .select(PLOT_COLUMNS)
      .from(plots)
      .where(and(eq(plots.id, plotId), isNull(plots.deletedAt)))
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODES.PLOT_NOT_FOUND,
        detail: MESSAGES.PLOTS.NOT_FOUND,
      });
    }

    return this.toPlotProjection(row);
  }

  /**
   * Creates a plot under the singleton farm while enforcing active `plotCode` uniqueness.
   */
  async createPlot(input: CreatePlotInput): Promise<PlotProjection> {
    const [singletonFarm] = await this.db
      .select({ id: farms.id })
      .from(farms)
      .orderBy(asc(farms.createdAt))
      .limit(1);

    if (!singletonFarm) {
      throw new NotFoundException({
        code: API_ERROR_CODES.FARM_NOT_FOUND,
        detail: MESSAGES.FARMS.NOT_FOUND,
      });
    }

    try {
      const [created] = await this.db
        .insert(plots)
        .values({
          farmId: singletonFarm.id,
          plotCode: input.plotCode,
          name: input.name,
          areaSqm: input.areaSqm.toFixed(2),
          soilTestResult: input.soilTestResult ?? null,
          waterTestResult: input.waterTestResult ?? null,
        })
        .returning(PLOT_COLUMNS);

      if (!created) {
        throw new Error("Plot insert returned no row.");
      }

      return this.toPlotProjection(created);
    } catch (error) {
      this.rethrowPlotConflict(error);
      throw error;
    }
  }

  /**
   * Updates mutable fields on an active plot while preserving active `plotCode` uniqueness.
   */
  async updatePlot(
    plotId: string,
    input: UpdatePlotInput,
  ): Promise<PlotProjection> {
    const patch: Partial<typeof plots.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.plotCode !== undefined) patch.plotCode = input.plotCode;
    if (input.name !== undefined) patch.name = input.name;
    if (input.areaSqm !== undefined) patch.areaSqm = input.areaSqm.toFixed(2);
    if (input.soilTestResult !== undefined) {
      patch.soilTestResult = input.soilTestResult;
    }
    if (input.waterTestResult !== undefined) {
      patch.waterTestResult = input.waterTestResult;
    }

    try {
      const [updated] = await this.db
        .update(plots)
        .set(patch)
        .where(and(eq(plots.id, plotId), isNull(plots.deletedAt)))
        .returning(PLOT_COLUMNS);

      if (!updated) {
        throw new NotFoundException({
          code: API_ERROR_CODES.PLOT_NOT_FOUND,
          detail: MESSAGES.PLOTS.NOT_FOUND,
        });
      }

      await this.traceCacheService.invalidateByPlotId(plotId);
      return this.toPlotProjection(updated);
    } catch (error) {
      this.rethrowPlotConflict(error);
      throw error;
    }
  }

  /**
   * Soft-deletes a plot inside a transaction after verifying no `planning` or
   * `active` season still depends on it.
   */
  async deletePlot(plotId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Lock the parent plot first (plots -> seasons) so concurrent season creation serializes cleanly.
      const [lockedPlot] = await tx
        .select({ id: plots.id })
        .from(plots)
        .where(and(eq(plots.id, plotId), isNull(plots.deletedAt)))
        .limit(1)
        .for("update");

      if (!lockedPlot) {
        throw new NotFoundException({
          code: API_ERROR_CODES.PLOT_NOT_FOUND,
          detail: MESSAGES.PLOTS.NOT_FOUND,
        });
      }

      const [blockingSeason] = await tx
        .select({ id: seasons.id })
        .from(seasons)
        .where(
          and(
            eq(seasons.plotId, plotId),
            inArray(seasons.status, [...BLOCKING_SEASON_STATUSES]),
          ),
        )
        .limit(1);

      if (blockingSeason) {
        throw new ConflictException({
          code: API_ERROR_CODES.PLOT_HAS_ACTIVE_SEASONS,
          detail: MESSAGES.PLOTS.HAS_ACTIVE_SEASONS,
        });
      }

      const now = new Date();
      await tx
        .update(plots)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(plots.id, plotId));
    });
  }

  private toPlotProjection(row: PlotRow): PlotProjection {
    return {
      id: row.id,
      farmId: row.farmId,
      plotCode: row.plotCode,
      name: row.name,
      areaSqm: Number(row.areaSqm),
      soilTestResult: row.soilTestResult,
      waterTestResult: row.waterTestResult,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private rethrowPlotConflict(error: unknown): void {
    const dbError = extractDatabaseErrorDetails(error);
    if (dbError.code === PG_ERROR_CODE.UNIQUE_VIOLATION) {
      throw new ConflictException({
        code: API_ERROR_CODES.PLOT_CODE_ALREADY_EXISTS,
        detail: MESSAGES.PLOTS.CODE_ALREADY_EXISTS,
      });
    }
  }
}
