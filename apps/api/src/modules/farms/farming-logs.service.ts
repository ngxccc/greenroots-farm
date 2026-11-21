import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { API_ERROR_CODES, FarmingActionType } from "@greenroots/shared";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { buildPaginationMeta } from "@/common/utils/api-response.util";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
} from "@/database/database.module";
import { farmingLogs, seasons, users } from "@/database/schemas";
import type {
  CreateFarmingLogInput,
  FarmingLogCorrectionRef,
  FarmingLogProjection,
  FarmingLogStaffSummary,
  FarmingLogTargetSummary,
  ListFarmingLogsQuery,
} from "./dto";
import {
  SEASON_ALLOWED_FARMING_ACTIONS,
  type FarmingLogSortOption,
} from "./farms.constant";
import { TraceCacheService } from "./trace-cache.service";

const FARMING_LOG_COLUMNS = {
  id: farmingLogs.id,
  seasonId: farmingLogs.seasonId,
  staffId: farmingLogs.staffId,
  actionType: farmingLogs.actionType,
  description: farmingLogs.description,
  mediaUrls: farmingLogs.mediaUrls,
  correctsLogId: farmingLogs.correctsLogId,
  loggedAt: farmingLogs.loggedAt,
} as const;

const FARMING_LOG_STAFF_COLUMNS = {
  id: users.id,
  fullName: users.fullName,
} as const;

const FARMING_LOG_TARGET_COLUMNS = {
  id: farmingLogs.id,
  seasonId: farmingLogs.seasonId,
  actionType: farmingLogs.actionType,
  description: farmingLogs.description,
  loggedAt: farmingLogs.loggedAt,
} as const;

type FarmingLogRow = Pick<
  typeof farmingLogs.$inferSelect,
  keyof typeof FARMING_LOG_COLUMNS
>;

type FarmingLogTargetRow = Pick<
  typeof farmingLogs.$inferSelect,
  keyof typeof FARMING_LOG_TARGET_COLUMNS
>;

const DEFAULT_FARMING_LOG_SORT: SQL[] = [
  desc(farmingLogs.loggedAt),
  desc(farmingLogs.id),
];

const FARMING_LOG_SORT_EXPRESSIONS = new Map<FarmingLogSortOption, SQL[]>([
  ["loggedAt:desc", DEFAULT_FARMING_LOG_SORT],
  ["loggedAt:asc", [asc(farmingLogs.loggedAt), asc(farmingLogs.id)]],
]);

/**
 * Manages append-only cultivation logs, phase-scoped action gates,
 * same-season correction linkage, and paginated timeline queries.
 */
@Injectable()
export class FarmingLogsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
    private readonly traceCacheService: TraceCacheService,
  ) {}

  /**
   * Lists paginated farming logs for a cultivation season ordered deterministically
   * by action timestamp (`loggedAt`), including staff summaries and bidirectional
   * correction linkage.
   *
   * @param seasonId Target season UUIDv7.
   * @param query Validated pagination, filter, and sort options.
   * @returns Paginated farming log projections and pagination metadata.
   */
  async listLogs(
    seasonId: string,
    query: ListFarmingLogsQuery,
  ): Promise<{ items: FarmingLogProjection[]; meta: PaginationMetaDto }> {
    const [season] = await this.db
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.id, seasonId))
      .limit(1);

    if (!season) {
      throw new NotFoundException({
        code: API_ERROR_CODES.SEASON_NOT_FOUND,
        detail: MESSAGES.SEASONS.NOT_FOUND,
      });
    }

    const conditions: SQL[] = [eq(farmingLogs.seasonId, seasonId)];
    if (query.actionType) {
      conditions.push(eq(farmingLogs.actionType, query.actionType));
    }

    const whereClause = and(...conditions);
    const offset = (query.page - 1) * query.limit;
    const orderByClauses =
      FARMING_LOG_SORT_EXPRESSIONS.get(query.sort) ?? DEFAULT_FARMING_LOG_SORT;

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(farmingLogs)
      .where(whereClause);

    const targetLog = alias(farmingLogs, "target_log");
    const rows = await this.db
      .select({
        log: FARMING_LOG_COLUMNS,
        staff: FARMING_LOG_STAFF_COLUMNS,
        targetLog: {
          id: targetLog.id,
          actionType: targetLog.actionType,
          description: targetLog.description,
          loggedAt: targetLog.loggedAt,
        },
      })
      .from(farmingLogs)
      .innerJoin(users, eq(farmingLogs.staffId, users.id))
      .leftJoin(targetLog, eq(farmingLogs.correctsLogId, targetLog.id))
      .where(whereClause)
      .orderBy(...orderByClauses)
      .limit(query.limit)
      .offset(offset);

    const correctedByMap = new Map<string, FarmingLogCorrectionRef[]>();
    if (rows.length > 0) {
      const pageLogIds = rows.map((row) => row.log.id);
      const correctionRows = await this.db
        .select({
          id: farmingLogs.id,
          correctsLogId: farmingLogs.correctsLogId,
          loggedAt: farmingLogs.loggedAt,
          staff: FARMING_LOG_STAFF_COLUMNS,
        })
        .from(farmingLogs)
        .innerJoin(users, eq(farmingLogs.staffId, users.id))
        .where(inArray(farmingLogs.correctsLogId, pageLogIds))
        .orderBy(asc(farmingLogs.loggedAt), asc(farmingLogs.id));

      for (const correction of correctionRows) {
        if (!correction.correctsLogId) continue;
        const list = correctedByMap.get(correction.correctsLogId) ?? [];
        list.push({
          id: correction.id,
          loggedAt: correction.loggedAt.toISOString(),
          staff: correction.staff,
        });
        correctedByMap.set(correction.correctsLogId, list);
      }
    }

    const total = Number(totalRow?.total ?? 0);
    return {
      items: rows.map((row) => {
        const target =
          row.log.correctsLogId && row.targetLog?.id ? row.targetLog : null;
        return this.toFarmingLogProjection(
          row.log,
          row.staff,
          target,
          correctedByMap.get(row.log.id) ?? [],
        );
      }),
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  }

  /**
   * Appends a new immutable farming log or correction entry to a season after
   * acquiring `seasons ... FOR SHARE` (`seasons -> farming_logs` lock order).
   *
   * @param seasonId Target season UUIDv7.
   * @param staffId Authenticated staff UUIDv7 from JWT `sub`.
   * @param input Validated log creation payload.
   * @returns Created farming log projection with staff and correction linkage.
   */
  async createLog(
    seasonId: string,
    staffId: string,
    input: CreateFarmingLogInput,
  ): Promise<FarmingLogProjection> {
    const createdProjection = await this.db.transaction(async (tx) => {
      // Lock the season row FOR SHARE so concurrent log writes run in parallel while
      // serializing cleanly against DELETE /seasons/:id and -> completed transitions.
      const [season] = await tx
        .select({ id: seasons.id, status: seasons.status })
        .from(seasons)
        .where(eq(seasons.id, seasonId))
        .limit(1)
        .for("share");

      if (!season) {
        throw new NotFoundException({
          code: API_ERROR_CODES.SEASON_NOT_FOUND,
          detail: MESSAGES.SEASONS.NOT_FOUND,
        });
      }

      const allowedActions = SEASON_ALLOWED_FARMING_ACTIONS[season.status];
      if (!allowedActions.includes(input.actionType)) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.FARMING_LOG_SEASON_STATUS_INVALID,
          detail: MESSAGES.FARMING_LOGS.SEASON_STATUS_DISALLOWS_ACTION,
        });
      }

      let targetRow: Omit<FarmingLogTargetRow, "seasonId"> | null = null;
      if (input.correctsLogId !== undefined) {
        if (input.actionType !== FarmingActionType.CORRECTION) {
          throw new UnprocessableEntityException({
            code: API_ERROR_CODES.FARMING_LOG_CORRECTION_TARGET_INVALID,
            detail: MESSAGES.FARMING_LOGS.CORRECTION_ID_NOT_ALLOWED_FOR_ACTION,
          });
        }

        const [foundTarget] = await tx
          .select(FARMING_LOG_TARGET_COLUMNS)
          .from(farmingLogs)
          .where(eq(farmingLogs.id, input.correctsLogId))
          .limit(1);

        if (!foundTarget || foundTarget.seasonId !== seasonId) {
          throw new UnprocessableEntityException({
            code: API_ERROR_CODES.FARMING_LOG_CORRECTION_TARGET_INVALID,
            detail:
              MESSAGES.FARMING_LOGS.CORRECTION_TARGET_MISSING_OR_CROSS_SEASON,
          });
        }

        targetRow = {
          id: foundTarget.id,
          actionType: foundTarget.actionType,
          description: foundTarget.description,
          loggedAt: foundTarget.loggedAt,
        };
      }

      try {
        const [created] = await tx
          .insert(farmingLogs)
          .values({
            seasonId,
            staffId,
            actionType: input.actionType,
            description: input.description,
            mediaUrls: input.mediaUrls ?? null,
            correctsLogId: input.correctsLogId ?? null,
          })
          .returning(FARMING_LOG_COLUMNS);

        if (!created) {
          throw new Error("Farming log insert returned no row.");
        }

        const [staffRow] = await tx
          .select(FARMING_LOG_STAFF_COLUMNS)
          .from(users)
          .where(eq(users.id, staffId))
          .limit(1);

        if (!staffRow) {
          throw new Error("Authenticated staff user row not found.");
        }

        return this.toFarmingLogProjection(created, staffRow, targetRow, []);
      } catch (error) {
        this.rethrowFarmingLogDbError(error);
        throw error;
      }
    });

    await this.traceCacheService.invalidateBySeasonId(seasonId);
    return createdProjection;
  }

  private toFarmingLogProjection(
    row: FarmingLogRow,
    staff: FarmingLogStaffSummary,
    targetRow: Omit<FarmingLogTargetRow, "seasonId"> | null,
    correctedBy: FarmingLogCorrectionRef[],
  ): FarmingLogProjection {
    const correctsLog: FarmingLogTargetSummary | null = targetRow
      ? {
          id: targetRow.id,
          actionType: targetRow.actionType,
          description: targetRow.description,
          loggedAt: targetRow.loggedAt.toISOString(),
        }
      : null;

    return {
      id: row.id,
      seasonId: row.seasonId,
      staffId: row.staffId,
      staff,
      actionType: row.actionType,
      description: row.description,
      mediaUrls: row.mediaUrls ?? [],
      correctsLogId: row.correctsLogId,
      correctsLog,
      correctedBy,
      loggedAt: row.loggedAt.toISOString(),
    };
  }

  private rethrowFarmingLogDbError(error: unknown): void {
    const dbError = extractDatabaseErrorDetails(error);

    if (
      dbError.code === PG_ERROR_CODE.FOREIGN_KEY_VIOLATION &&
      dbError.constraint === "farming_logs_corrects_log_same_season_fkey"
    ) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.FARMING_LOG_CORRECTION_TARGET_INVALID,
        detail: MESSAGES.FARMING_LOGS.CORRECTION_TARGET_MISSING_OR_CROSS_SEASON,
      });
    }

    if (
      dbError.code === PG_ERROR_CODE.CHECK_VIOLATION &&
      dbError.constraint === "farming_logs_correction_action_chk"
    ) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.FARMING_LOG_CORRECTION_TARGET_INVALID,
        detail: MESSAGES.FARMING_LOGS.CORRECTION_ID_NOT_ALLOWED_FOR_ACTION,
      });
    }

    if (
      dbError.code === PG_ERROR_CODE.CHECK_VIOLATION &&
      dbError.constraint === "farming_logs_no_self_correction_chk"
    ) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.FARMING_LOG_CORRECTION_TARGET_INVALID,
        detail: MESSAGES.FARMING_LOGS.SELF_CORRECTION_FORBIDDEN,
      });
    }
  }
}
