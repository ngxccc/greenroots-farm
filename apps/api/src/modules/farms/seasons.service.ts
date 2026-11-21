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
  isNull,
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
import { batches, farmingLogs, plots, seasons } from "@/database/schemas";
import type {
  CreateSeasonInput,
  ListSeasonsQuery,
  SeasonPlotSummary,
  SeasonProjection,
  UpdateSeasonInput,
} from "./dto";
import {
  SEASON_ALLOWED_TRANSITIONS,
  type SeasonSortOption,
} from "./farms.constant";
import { escapeLikePattern } from "./farms.utils";
import { TraceCacheService } from "./trace-cache.service";

const SEASON_COLUMNS = {
  id: seasons.id,
  plotId: seasons.plotId,
  seasonName: seasons.seasonName,
  startDate: seasons.startDate,
  expectedHarvestDate: seasons.expectedHarvestDate,
  status: seasons.status,
  createdAt: seasons.createdAt,
  updatedAt: seasons.updatedAt,
} as const;

const SEASON_PLOT_SUMMARY_COLUMNS = {
  id: plots.id,
  plotCode: plots.plotCode,
  name: plots.name,
  areaSqm: plots.areaSqm,
  deletedAt: plots.deletedAt,
} as const;

type SeasonRow = Pick<typeof seasons.$inferSelect, keyof typeof SEASON_COLUMNS>;
type SeasonPlotSummaryRow = Pick<
  typeof plots.$inferSelect,
  keyof typeof SEASON_PLOT_SUMMARY_COLUMNS
>;
type DrizzleTx = Parameters<Parameters<DrizzleDB["transaction"]>[0]>[0];

const SEASON_SORT_EXPRESSIONS = new Map<SeasonSortOption, SQL[]>([
  ["createdAt:desc", [desc(seasons.createdAt), desc(seasons.id)]],
  ["createdAt:asc", [asc(seasons.createdAt), desc(seasons.id)]],
  ["startDate:desc", [desc(seasons.startDate), desc(seasons.id)]],
  ["startDate:asc", [asc(seasons.startDate), desc(seasons.id)]],
  [
    "expectedHarvestDate:asc",
    [asc(seasons.expectedHarvestDate), desc(seasons.id)],
  ],
  [
    "expectedHarvestDate:desc",
    [desc(seasons.expectedHarvestDate), desc(seasons.id)],
  ],
]);

/**
 * Manages cultivation season CRUD, linear lifecycle state transitions,
 * single-active-season-per-plot invariants, and planning-only delete guards.
 */
@Injectable()
export class SeasonsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
    private readonly traceCacheService: TraceCacheService,
  ) {}

  /**
   * Lists cultivation seasons with pagination, status/plotId/search filters,
   * and nested plot summaries (including historical soft-deleted plots).
   */
  async listSeasons(
    query: ListSeasonsQuery,
  ): Promise<{ items: SeasonProjection[]; meta: PaginationMetaDto }> {
    const conditions: SQL[] = [];

    if (query.status) {
      conditions.push(eq(seasons.status, query.status));
    }
    if (query.plotId) {
      conditions.push(eq(seasons.plotId, query.plotId));
    }
    if (query.q) {
      const pattern = `%${escapeLikePattern(query.q)}%`;
      conditions.push(ilike(seasons.seasonName, pattern));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (query.page - 1) * query.limit;
    const orderByClauses = SEASON_SORT_EXPRESSIONS.get(query.sort) ?? [
      desc(seasons.createdAt),
      desc(seasons.id),
    ];

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(seasons)
      .where(whereClause);

    const rows = await this.db
      .select({
        season: SEASON_COLUMNS,
        plot: SEASON_PLOT_SUMMARY_COLUMNS,
      })
      .from(seasons)
      .innerJoin(plots, eq(seasons.plotId, plots.id))
      .where(whereClause)
      .orderBy(...orderByClauses)
      .limit(query.limit)
      .offset(offset);

    const total = Number(totalRow?.total ?? 0);
    return {
      items: rows.map((row) => this.toSeasonProjection(row.season, row.plot)),
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  }

  /**
   * Fetches a single cultivation season by UUIDv7, preserving plot metadata
   * even if the linked plot was soft-deleted after harvest.
   */
  async getSeasonById(seasonId: string): Promise<SeasonProjection> {
    const [row] = await this.db
      .select({
        season: SEASON_COLUMNS,
        plot: SEASON_PLOT_SUMMARY_COLUMNS,
      })
      .from(seasons)
      .innerJoin(plots, eq(seasons.plotId, plots.id))
      .where(eq(seasons.id, seasonId))
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODES.SEASON_NOT_FOUND,
        detail: MESSAGES.SEASONS.NOT_FOUND,
      });
    }

    return this.toSeasonProjection(row.season, row.plot);
  }

  /**
   * Creates a cultivation season in `planning` status after locking the live
   * parent plot row (`plots -> seasons` lock order per ADR-0021).
   */
  async createSeason(input: CreateSeasonInput): Promise<SeasonProjection> {
    return this.db.transaction(async (tx) => {
      const [livePlot] = await tx
        .select(SEASON_PLOT_SUMMARY_COLUMNS)
        .from(plots)
        .where(and(eq(plots.id, input.plotId), isNull(plots.deletedAt)))
        .limit(1)
        .for("update");

      if (!livePlot) {
        throw new NotFoundException({
          code: API_ERROR_CODES.PLOT_NOT_FOUND,
          detail: MESSAGES.PLOTS.NOT_FOUND,
        });
      }

      try {
        const [created] = await tx
          .insert(seasons)
          .values({
            plotId: input.plotId,
            seasonName: input.seasonName,
            startDate: input.startDate,
            expectedHarvestDate: input.expectedHarvestDate,
            status: SeasonStatus.PLANNING,
          })
          .returning(SEASON_COLUMNS);

        if (!created) {
          throw new Error("Season insert returned no row.");
        }

        return this.toSeasonProjection(created, livePlot);
      } catch (error) {
        this.rethrowSeasonDbError(error);
        throw error;
      }
    });
  }

  /**
   * Updates mutable season fields or advances the linear lifecycle state machine
   * while preserving `plots -> seasons` lock ordering.
   */
  async updateSeason(
    seasonId: string,
    input: UpdateSeasonInput,
  ): Promise<SeasonProjection> {
    const updatedProjection = await this.db.transaction(async (tx) => {
      const [preRead] = await tx
        .select(SEASON_COLUMNS)
        .from(seasons)
        .where(eq(seasons.id, seasonId))
        .limit(1);

      if (!preRead) {
        throw new NotFoundException({
          code: API_ERROR_CODES.SEASON_NOT_FOUND,
          detail: MESSAGES.SEASONS.NOT_FOUND,
        });
      }

      // Reject state-machine or field-lock violations before locking plots so
      // historical seasons with soft-deleted plots return 422 instead of 404.
      this.validateSeasonUpdate(preRead, input);

      const lockedPlotCheck = await this.lockTargetPlotsBeforeSeason(
        tx,
        preRead,
        input,
      );

      const [lockedSeason] = await tx
        .select(SEASON_COLUMNS)
        .from(seasons)
        .where(eq(seasons.id, seasonId))
        .limit(1)
        .for("update");

      if (!lockedSeason) {
        throw new NotFoundException({
          code: API_ERROR_CODES.SEASON_NOT_FOUND,
          detail: MESSAGES.SEASONS.NOT_FOUND,
        });
      }

      if (lockedPlotCheck && lockedSeason.plotId !== preRead.plotId) {
        throw new ConflictException({
          code: API_ERROR_CODES.CONCURRENCY_CONFLICT,
          detail: MESSAGES.DATABASE.CONCURRENCY_CONFLICT,
        });
      }

      this.validateSeasonUpdate(lockedSeason, input);

      const patch: Partial<typeof seasons.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.plotId !== undefined) patch.plotId = input.plotId;
      if (input.seasonName !== undefined) patch.seasonName = input.seasonName;
      if (input.startDate !== undefined) patch.startDate = input.startDate;
      if (input.expectedHarvestDate !== undefined) {
        patch.expectedHarvestDate = input.expectedHarvestDate;
      }
      if (input.status !== undefined) patch.status = input.status;

      try {
        const [updated] = await tx
          .update(seasons)
          .set(patch)
          .where(eq(seasons.id, seasonId))
          .returning(SEASON_COLUMNS);

        if (!updated) {
          throw new NotFoundException({
            code: API_ERROR_CODES.SEASON_NOT_FOUND,
            detail: MESSAGES.SEASONS.NOT_FOUND,
          });
        }

        const [plotRow] = await tx
          .select(SEASON_PLOT_SUMMARY_COLUMNS)
          .from(plots)
          .where(eq(plots.id, updated.plotId))
          .limit(1);

        if (!plotRow) {
          throw new NotFoundException({
            code: API_ERROR_CODES.PLOT_NOT_FOUND,
            detail: MESSAGES.PLOTS.NOT_FOUND,
          });
        }

        return this.toSeasonProjection(updated, plotRow);
      } catch (error) {
        this.rethrowSeasonDbError(error);
        throw error;
      }
    });

    await this.traceCacheService.invalidateBySeasonId(seasonId);
    return updatedProjection;
  }

  /**
   * Hard-deletes a `planning` season only when zero `batches` and zero
   * `farming_logs` reference it (`409 SEASON_NOT_DELETABLE` otherwise).
   */
  async deleteSeason(seasonId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [lockedSeason] = await tx
        .select({ id: seasons.id, status: seasons.status })
        .from(seasons)
        .where(eq(seasons.id, seasonId))
        .limit(1)
        .for("update");

      if (!lockedSeason) {
        throw new NotFoundException({
          code: API_ERROR_CODES.SEASON_NOT_FOUND,
          detail: MESSAGES.SEASONS.NOT_FOUND,
        });
      }

      if (lockedSeason.status !== SeasonStatus.PLANNING) {
        throw new ConflictException({
          code: API_ERROR_CODES.SEASON_NOT_DELETABLE,
          detail: MESSAGES.SEASONS.NOT_DELETABLE_STATUS,
        });
      }

      const [linkedBatch] = await tx
        .select({ id: batches.id })
        .from(batches)
        .where(eq(batches.seasonId, seasonId))
        .limit(1);

      if (linkedBatch) {
        throw new ConflictException({
          code: API_ERROR_CODES.SEASON_NOT_DELETABLE,
          detail: MESSAGES.SEASONS.NOT_DELETABLE_BATCHES,
        });
      }

      // Check farming_logs before DELETE so ON DELETE CASCADE never trips trg_immutable_farming_logs (403).
      const [linkedLog] = await tx
        .select({ id: farmingLogs.id })
        .from(farmingLogs)
        .where(eq(farmingLogs.seasonId, seasonId))
        .limit(1);

      if (linkedLog) {
        throw new ConflictException({
          code: API_ERROR_CODES.SEASON_NOT_DELETABLE,
          detail: MESSAGES.SEASONS.NOT_DELETABLE_LOGS,
        });
      }

      await tx.delete(seasons).where(eq(seasons.id, seasonId));
    });
  }

  private async lockTargetPlotsBeforeSeason(
    tx: DrizzleTx,
    preRead: { plotId: string; status: SeasonStatus },
    input: UpdateSeasonInput,
  ): Promise<boolean> {
    const needsPlotChange =
      input.plotId !== undefined && input.plotId !== preRead.plotId;
    const needsActiveCheck = input.status === SeasonStatus.ACTIVE;

    if (!needsPlotChange && !needsActiveCheck) {
      return false;
    }

    // Lock plots in ascending UUID order before locking seasons to match ADR-0021 (plots -> seasons).
    const candidateIds = new Set<string>();
    if (needsPlotChange && input.plotId) {
      candidateIds.add(input.plotId);
      if (preRead.status === SeasonStatus.PLANNING) {
        candidateIds.add(preRead.plotId);
      }
    } else if (needsActiveCheck) {
      candidateIds.add(input.plotId ?? preRead.plotId);
    }

    const sortedIds = [...candidateIds].sort((a, b) => a.localeCompare(b));
    if (sortedIds.length === 0) return false;

    const lockedPlots = await tx
      .select({ id: plots.id })
      .from(plots)
      .where(and(inArray(plots.id, sortedIds), isNull(plots.deletedAt)))
      .orderBy(asc(plots.id))
      .for("update");

    const requiredPlotId = input.plotId ?? preRead.plotId;
    if (!lockedPlots.some((plot) => plot.id === requiredPlotId)) {
      throw new NotFoundException({
        code: API_ERROR_CODES.PLOT_NOT_FOUND,
        detail: MESSAGES.PLOTS.NOT_FOUND,
      });
    }

    return true;
  }

  private validateSeasonUpdate(
    current: SeasonRow,
    input: UpdateSeasonInput,
  ): void {
    if (current.status === SeasonStatus.COMPLETED) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.SEASON_INVALID_STATUS_TRANSITION,
        detail: MESSAGES.SEASONS.COMPLETED_IMMUTABLE,
      });
    }

    if (
      current.status === SeasonStatus.HARVESTED &&
      input.status === SeasonStatus.HARVESTED
    ) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.SEASON_INVALID_STATUS_TRANSITION,
        detail: MESSAGES.SEASONS.INVALID_STATUS_TRANSITION,
      });
    }

    if (input.status !== undefined && input.status !== current.status) {
      const allowed = SEASON_ALLOWED_TRANSITIONS[current.status];
      if (!allowed.includes(input.status)) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.SEASON_INVALID_STATUS_TRANSITION,
          detail: MESSAGES.SEASONS.INVALID_STATUS_TRANSITION,
        });
      }
    }

    if (
      current.status === SeasonStatus.ACTIVE &&
      (input.plotId !== undefined || input.startDate !== undefined)
    ) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.SEASON_INVALID_STATUS_TRANSITION,
        detail: MESSAGES.SEASONS.FIELD_LOCKED,
      });
    }

    if (
      current.status === SeasonStatus.HARVESTED &&
      (input.seasonName !== undefined ||
        input.plotId !== undefined ||
        input.startDate !== undefined ||
        input.expectedHarvestDate !== undefined)
    ) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.SEASON_INVALID_STATUS_TRANSITION,
        detail: MESSAGES.SEASONS.FIELD_LOCKED,
      });
    }

    const effectiveStartDate = input.startDate ?? current.startDate;
    const effectiveExpectedHarvestDate =
      input.expectedHarvestDate ?? current.expectedHarvestDate;

    if (effectiveStartDate > effectiveExpectedHarvestDate) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.SEASON_INVALID_DATE_RANGE,
        detail: MESSAGES.SEASONS.INVALID_DATE_RANGE,
      });
    }
  }

  private toSeasonProjection(
    row: SeasonRow,
    plotRow: SeasonPlotSummaryRow,
  ): SeasonProjection {
    const plot: SeasonPlotSummary = {
      id: plotRow.id,
      plotCode: plotRow.plotCode,
      name: plotRow.name,
      areaSqm: Number(plotRow.areaSqm),
      deletedAt: plotRow.deletedAt ? plotRow.deletedAt.toISOString() : null,
    };

    return {
      id: row.id,
      plotId: row.plotId,
      seasonName: row.seasonName,
      startDate: row.startDate,
      expectedHarvestDate: row.expectedHarvestDate,
      status: row.status,
      plot,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private rethrowSeasonDbError(error: unknown): void {
    const dbError = extractDatabaseErrorDetails(error);

    if (
      dbError.code === PG_ERROR_CODE.UNIQUE_VIOLATION &&
      (dbError.constraint === "seasons_one_active_per_plot_uidx" ||
        Boolean(dbError.detail?.includes("Key (plot_id)=")))
    ) {
      throw new ConflictException({
        code: API_ERROR_CODES.SEASON_PLOT_ACTIVE_CONFLICT,
        detail: MESSAGES.SEASONS.PLOT_ACTIVE_CONFLICT,
      });
    }

    if (
      dbError.code === PG_ERROR_CODE.CHECK_VIOLATION &&
      (!dbError.constraint ||
        dbError.constraint === "seasons_date_range_valid_chk")
    ) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.SEASON_INVALID_DATE_RANGE,
        detail: MESSAGES.SEASONS.INVALID_DATE_RANGE,
      });
    }
  }
}
