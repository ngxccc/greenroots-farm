import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, asc, count, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  API_ERROR_CODES,
  BatchStatus,
  UserRole,
  WasteLogStatus,
} from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import type { JwtPayload } from "@/common/decorators/current-user.decorator";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { buildPaginationMeta } from "@/common/utils/api-response.util";
import { escapeLikePattern } from "@/common/utils/query.util";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
} from "@/database/database.module";
import { batches, products, users, wasteLogs } from "@/database/schemas";
import type {
  CreateWasteLogInput,
  ListWasteLogsQuery,
  RejectWasteLogInput,
  WasteLogBatchSummary,
  WasteLogProjection,
  WasteLogUserSummary,
} from "./dto";
import {
  ELIGIBLE_WASTE_BATCH_STATUSES,
  type WasteLogSortOption,
} from "./inventory.constant";

const reporterUsers = alias(users, "waste_log_reporter");
const reviewerUsers = alias(users, "waste_log_reviewer");

const WASTE_LOG_COLUMNS = {
  id: wasteLogs.id,
  batchId: wasteLogs.batchId,
  reportedBy: wasteLogs.reportedBy,
  reviewedBy: wasteLogs.reviewedBy,
  discardedQuantity: wasteLogs.discardedQuantity,
  reason: wasteLogs.reason,
  rejectionReason: wasteLogs.rejectionReason,
  mediaUrls: wasteLogs.mediaUrls,
  status: wasteLogs.status,
  reviewedAt: wasteLogs.reviewedAt,
  createdAt: wasteLogs.createdAt,
  updatedAt: wasteLogs.updatedAt,
} as const;

const WASTE_LOG_LOCK_COLUMNS = {
  id: wasteLogs.id,
  batchId: wasteLogs.batchId,
  reportedBy: wasteLogs.reportedBy,
  discardedQuantity: wasteLogs.discardedQuantity,
  status: wasteLogs.status,
} as const;

type WasteLogRow = Pick<
  typeof wasteLogs.$inferSelect,
  keyof typeof WASTE_LOG_COLUMNS
>;

interface WasteLogJoinedRow {
  wasteLog: WasteLogRow;
  batch: {
    id: string;
    batchCode: string;
    productId: string;
    productName: string;
    unit: string;
    status: BatchStatus;
    availableQuantity: string;
  };
  reporter: WasteLogUserSummary;
  reviewer: WasteLogUserSummary | null;
}

type DrizzleExecutor = Pick<DrizzleDB, "select">;

const WASTE_PROPOSAL_ALLOWED_ROLES: readonly UserRole[] = [
  UserRole.FARM_STAFF,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
];

const WASTE_REVIEW_ALLOWED_ROLES: readonly UserRole[] = [
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
];

const WASTE_LOG_SORT_EXPRESSIONS = new Map<WasteLogSortOption, SQL[]>([
  ["createdAt:desc", [desc(wasteLogs.createdAt), desc(wasteLogs.id)]],
  ["createdAt:asc", [asc(wasteLogs.createdAt), desc(wasteLogs.id)]],
  [
    "discardedQuantity:desc",
    [desc(wasteLogs.discardedQuantity), desc(wasteLogs.id)],
  ],
  [
    "discardedQuantity:asc",
    [asc(wasteLogs.discardedQuantity), desc(wasteLogs.id)],
  ],
]);

/**
 * Manages two-step inventory waste write-off proposals, role-scoped reads,
 * and atomic administrative approval/rejection transactions.
 */
@Injectable()
export class WasteLogsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
  ) {}

  /**
   * Creates a pending waste write-off proposal without deducting sellable batch stock.
   *
   * @param input Validated proposal payload.
   * @param actorId Authenticated staff reporter UUIDv7.
   * @returns Created waste log projection.
   */
  async createWasteLog(
    input: CreateWasteLogInput,
    actor: Pick<JwtPayload, "sub" | "role">,
  ): Promise<WasteLogProjection> {
    this.assertAllowedRole(actor.role, WASTE_PROPOSAL_ALLOWED_ROLES);

    const createdRow = await this.db.transaction(async (tx) => {
      // Serialize concurrent proposals against the same batch to enforce pending quota accurately.
      const [batch] = await tx
        .select({
          id: batches.id,
          status: batches.status,
          availableQuantity: batches.availableQuantity,
        })
        .from(batches)
        .where(eq(batches.id, input.batchId))
        .limit(1)
        .for("update");

      if (!batch) {
        throw new NotFoundException({
          code: API_ERROR_CODES.BATCH_NOT_FOUND,
          detail: MESSAGES.BATCHES.NOT_FOUND,
        });
      }

      const availableCents = toQuantityCents(batch.availableQuantity);
      if (
        !ELIGIBLE_WASTE_BATCH_STATUSES.includes(batch.status) ||
        availableCents <= 0
      ) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.WASTE_LOG_BATCH_NOT_ELIGIBLE,
          detail: MESSAGES.WASTE_LOGS.BATCH_NOT_ELIGIBLE,
        });
      }

      const [pendingRow] = await tx
        .select({
          pendingSum: sql<string>`COALESCE(SUM(${wasteLogs.discardedQuantity}), 0)`,
        })
        .from(wasteLogs)
        .where(
          and(
            eq(wasteLogs.batchId, batch.id),
            eq(wasteLogs.status, WasteLogStatus.PENDING_APPROVAL),
          ),
        );

      const pendingCents = toQuantityCents(pendingRow?.pendingSum ?? 0);
      const requestedCents = toQuantityCents(input.discardedQuantity);

      if (requestedCents > availableCents - pendingCents) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.WASTE_LOG_QUANTITY_EXCEEDS_AVAILABLE,
          detail: MESSAGES.WASTE_LOGS.QUANTITY_EXCEEDS_AVAILABLE,
        });
      }

      const [inserted] = await tx
        .insert(wasteLogs)
        .values({
          batchId: batch.id,
          reportedBy: actor.sub,
          discardedQuantity: input.discardedQuantity.toFixed(2),
          reason: input.reason,
          mediaUrls: input.mediaUrls,
          status: WasteLogStatus.PENDING_APPROVAL,
        })
        .returning({ id: wasteLogs.id });

      if (!inserted) {
        throw new Error("Failed to insert waste log record.");
      }

      const joined = await this.fetchJoinedWasteLogById(tx, inserted.id);
      if (!joined) {
        throw new Error("Failed to load created waste log record.");
      }

      return joined;
    });

    return this.toProjection(createdRow);
  }

  /**
   * Lists waste logs with filters and role-based ownership scoping.
   *
   * @param query Validated pagination, filter, and sort parameters.
   * @param actor Authenticated staff JWT payload.
   * @returns Paginated waste log projections and metadata.
   */
  async listWasteLogs(
    query: ListWasteLogsQuery,
    actor: Pick<JwtPayload, "sub" | "role">,
  ): Promise<{ items: WasteLogProjection[]; meta: PaginationMetaDto }> {
    this.assertAllowedRole(actor.role, WASTE_PROPOSAL_ALLOWED_ROLES);

    const conditions: SQL[] = [];

    if (!WASTE_REVIEW_ALLOWED_ROLES.includes(actor.role)) {
      conditions.push(eq(wasteLogs.reportedBy, actor.sub));
    }

    if (query.status !== undefined) {
      conditions.push(eq(wasteLogs.status, query.status));
    }

    if (query.batchId !== undefined) {
      conditions.push(eq(wasteLogs.batchId, query.batchId));
    }

    if (query.productId !== undefined) {
      conditions.push(eq(batches.productId, query.productId));
    }

    if (query.search !== undefined) {
      const pattern = `%${escapeLikePattern(query.search)}%`;
      conditions.push(ilike(batches.batchCode, pattern));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const orderBy =
      WASTE_LOG_SORT_EXPRESSIONS.get(query.sort) ??
      WASTE_LOG_SORT_EXPRESSIONS.get("createdAt:desc")!;
    const offset = (query.page - 1) * query.limit;

    const [totalRow] = await this.db
      .select({ total: count() })
      .from(wasteLogs)
      .innerJoin(batches, eq(wasteLogs.batchId, batches.id))
      .where(whereClause);

    const rows = await this.db
      .select(this.joinedSelectShape())
      .from(wasteLogs)
      .innerJoin(batches, eq(wasteLogs.batchId, batches.id))
      .innerJoin(products, eq(batches.productId, products.id))
      .innerJoin(reporterUsers, eq(wasteLogs.reportedBy, reporterUsers.id))
      .leftJoin(reviewerUsers, eq(wasteLogs.reviewedBy, reviewerUsers.id))
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(query.limit)
      .offset(offset);

    const total = Number(totalRow?.total ?? 0);

    return {
      items: rows.map((row) => this.toProjection(row)),
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  }

  /**
   * Retrieves a single waste log by UUIDv7, enforcing reporter ownership for farm staff.
   *
   * @param id Waste log UUIDv7 identifier.
   * @param actor Authenticated staff JWT payload.
   * @returns Waste log projection.
   */
  async getWasteLogById(
    id: string,
    actor: Pick<JwtPayload, "sub" | "role">,
  ): Promise<WasteLogProjection> {
    this.assertAllowedRole(actor.role, WASTE_PROPOSAL_ALLOWED_ROLES);

    const row = await this.fetchJoinedWasteLogById(this.db, id);

    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODES.WASTE_LOG_NOT_FOUND,
        detail: MESSAGES.WASTE_LOGS.NOT_FOUND,
      });
    }

    if (
      !WASTE_REVIEW_ALLOWED_ROLES.includes(actor.role) &&
      row.wasteLog.reportedBy !== actor.sub
    ) {
      throw new ForbiddenException({
        code: API_ERROR_CODES.FORBIDDEN,
        detail: MESSAGES.COMMON.FORBIDDEN,
      });
    }

    return this.toProjection(row);
  }

  /**
   * Atomically approves a pending waste log, deducting batch stock and transitioning
   * depleted sellable batches to `sold_out`.
   *
   * @param id Waste log UUIDv7 identifier.
   * @param actor Authenticated admin or super-admin JWT payload.
   * @returns Approved waste log projection with updated batch summary.
   */
  async approveWasteLog(
    id: string,
    actor: Pick<JwtPayload, "sub" | "role">,
  ): Promise<WasteLogProjection> {
    this.assertAllowedRole(actor.role, WASTE_REVIEW_ALLOWED_ROLES);

    const updatedRow = await this.db.transaction(async (tx) => {
      // Lock waste_logs before batches consistently to serialize concurrent approvals/rejections.
      const wasteLog = await this.lockPendingWasteLogForReview(
        tx,
        id,
        actor.sub,
      );

      const [batch] = await tx
        .select({
          id: batches.id,
          status: batches.status,
          availableQuantity: batches.availableQuantity,
        })
        .from(batches)
        .where(eq(batches.id, wasteLog.batchId))
        .limit(1)
        .for("update");

      if (!batch) {
        throw new NotFoundException({
          code: API_ERROR_CODES.BATCH_NOT_FOUND,
          detail: MESSAGES.BATCHES.NOT_FOUND,
        });
      }

      const availableCents = toQuantityCents(batch.availableQuantity);
      const discardedCents = toQuantityCents(wasteLog.discardedQuantity);

      if (availableCents < discardedCents) {
        throw new ConflictException({
          code: API_ERROR_CODES.INSUFFICIENT_STOCK,
          detail: MESSAGES.WASTE_LOGS.INSUFFICIENT_STOCK,
        });
      }

      const newAvailableCents = availableCents - discardedCents;
      const newAvailableQuantity = (newAvailableCents / 100).toFixed(2);
      const nextBatchStatus =
        newAvailableCents === 0 &&
        (batch.status === BatchStatus.IN_STOCK ||
          batch.status === BatchStatus.NEAR_EXPIRY)
          ? BatchStatus.SOLD_OUT
          : batch.status;

      const now = new Date();

      await tx
        .update(batches)
        .set({
          availableQuantity: newAvailableQuantity,
          status: nextBatchStatus,
          updatedAt: now,
        })
        .where(eq(batches.id, batch.id));

      await tx
        .update(wasteLogs)
        .set({
          status: WasteLogStatus.APPROVED,
          reviewedBy: actor.sub,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(eq(wasteLogs.id, wasteLog.id));

      const joined = await this.fetchJoinedWasteLogById(tx, wasteLog.id);
      if (!joined) {
        throw new Error("Failed to load approved waste log record.");
      }

      return joined;
    });

    return this.toProjection(updatedRow);
  }

  /**
   * Atomically rejects a pending waste log with a mandatory rejection reason and no stock mutation.
   *
   * @param id Waste log UUIDv7 identifier.
   * @param input Validated rejection payload.
   * @param actor Authenticated admin or super-admin JWT payload.
   * @returns Rejected waste log projection.
   */
  async rejectWasteLog(
    id: string,
    input: RejectWasteLogInput,
    actor: Pick<JwtPayload, "sub" | "role">,
  ): Promise<WasteLogProjection> {
    this.assertAllowedRole(actor.role, WASTE_REVIEW_ALLOWED_ROLES);

    const updatedRow = await this.db.transaction(async (tx) => {
      const wasteLog = await this.lockPendingWasteLogForReview(
        tx,
        id,
        actor.sub,
      );
      const now = new Date();

      await tx
        .update(wasteLogs)
        .set({
          status: WasteLogStatus.REJECTED,
          reviewedBy: actor.sub,
          reviewedAt: now,
          rejectionReason: input.rejectionReason,
          updatedAt: now,
        })
        .where(eq(wasteLogs.id, wasteLog.id));

      const joined = await this.fetchJoinedWasteLogById(tx, wasteLog.id);
      if (!joined) {
        throw new Error("Failed to load rejected waste log record.");
      }

      return joined;
    });

    return this.toProjection(updatedRow);
  }

  private assertAllowedRole(
    role: UserRole,
    allowedRoles: readonly UserRole[],
  ): void {
    if (!allowedRoles.includes(role)) {
      throw new ForbiddenException({
        code: API_ERROR_CODES.FORBIDDEN,
        detail: MESSAGES.COMMON.FORBIDDEN,
      });
    }
  }

  private async lockPendingWasteLogForReview(
    tx: DrizzleExecutor & { select: DrizzleDB["select"] },
    id: string,
    actorId: string,
  ) {
    const [wasteLog] = await tx
      .select(WASTE_LOG_LOCK_COLUMNS)
      .from(wasteLogs)
      .where(eq(wasteLogs.id, id))
      .limit(1)
      .for("update");

    if (!wasteLog) {
      throw new NotFoundException({
        code: API_ERROR_CODES.WASTE_LOG_NOT_FOUND,
        detail: MESSAGES.WASTE_LOGS.NOT_FOUND,
      });
    }

    if (wasteLog.status !== WasteLogStatus.PENDING_APPROVAL) {
      throw new ConflictException({
        code: API_ERROR_CODES.WASTE_LOG_ALREADY_REVIEWED,
        detail: MESSAGES.WASTE_LOGS.ALREADY_REVIEWED,
      });
    }

    if (wasteLog.reportedBy === actorId) {
      throw new ForbiddenException({
        code: API_ERROR_CODES.WASTE_LOG_SELF_REVIEW_FORBIDDEN,
        detail: MESSAGES.WASTE_LOGS.SELF_REVIEW_FORBIDDEN,
      });
    }

    return wasteLog;
  }

  private joinedSelectShape() {
    return {
      wasteLog: WASTE_LOG_COLUMNS,
      batch: {
        id: batches.id,
        batchCode: batches.batchCode,
        productId: batches.productId,
        productName: products.name,
        unit: products.unit,
        status: batches.status,
        availableQuantity: batches.availableQuantity,
      },
      reporter: {
        id: reporterUsers.id,
        fullName: reporterUsers.fullName,
      },
      reviewer: {
        id: reviewerUsers.id,
        fullName: reviewerUsers.fullName,
      },
    };
  }

  private async fetchJoinedWasteLogById(
    executor: DrizzleExecutor,
    id: string,
  ): Promise<WasteLogJoinedRow | undefined> {
    const [row] = await executor
      .select(this.joinedSelectShape())
      .from(wasteLogs)
      .innerJoin(batches, eq(wasteLogs.batchId, batches.id))
      .innerJoin(products, eq(batches.productId, products.id))
      .innerJoin(reporterUsers, eq(wasteLogs.reportedBy, reporterUsers.id))
      .leftJoin(reviewerUsers, eq(wasteLogs.reviewedBy, reviewerUsers.id))
      .where(eq(wasteLogs.id, id))
      .limit(1);

    return row;
  }

  private toProjection(row: WasteLogJoinedRow): WasteLogProjection {
    const batchSummary: WasteLogBatchSummary = {
      id: row.batch.id,
      batchCode: row.batch.batchCode,
      productId: row.batch.productId,
      productName: row.batch.productName,
      unit: row.batch.unit,
      status: row.batch.status,
      availableQuantity: Number(row.batch.availableQuantity),
    };

    const reviewerSummary: WasteLogUserSummary | null = row.reviewer
      ? { id: row.reviewer.id, fullName: row.reviewer.fullName }
      : null;

    return {
      id: row.wasteLog.id,
      batchId: row.wasteLog.batchId,
      batch: batchSummary,
      reporter: row.reporter,
      reviewer: reviewerSummary,
      discardedQuantity: Number(row.wasteLog.discardedQuantity),
      reason: row.wasteLog.reason,
      rejectionReason: row.wasteLog.rejectionReason,
      mediaUrls: row.wasteLog.mediaUrls,
      status: row.wasteLog.status,
      reviewedAt: row.wasteLog.reviewedAt
        ? row.wasteLog.reviewedAt.toISOString()
        : null,
      createdAt: row.wasteLog.createdAt.toISOString(),
      updatedAt: row.wasteLog.updatedAt.toISOString(),
    };
  }
}

function toQuantityCents(value: string | number): number {
  return Math.round(Number(value) * 100);
}
