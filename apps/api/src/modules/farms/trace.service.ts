import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { API_ERROR_CODES } from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
} from "@/database/database.module";
import {
  batches,
  farmingLogs,
  farms,
  plots,
  products,
  seasons,
  users,
} from "@/database/schemas";
import type {
  TraceLogCorrectionRef,
  TraceLogTargetSummary,
  TraceRecordProjection,
} from "./dto";
import { TRACE_MAX_FARMING_LOGS } from "./farms.interface";
import { TraceCacheService } from "./trace-cache.service";

const TRACE_BATCH_COLUMNS = {
  id: batches.id,
  batchCode: batches.batchCode,
  harvestDate: batches.harvestDate,
  expirationDate: batches.expirationDate,
  status: batches.status,
} as const;

const TRACE_PRODUCT_COLUMNS = {
  id: products.id,
  name: products.name,
  slug: products.slug,
  unit: products.unit,
  imageUrls: products.imageUrls,
} as const;

const TRACE_FARM_COLUMNS = {
  name: farms.name,
  legalName: farms.legalName,
  tagline: farms.tagline,
  address: farms.address,
  certificationUrl: farms.certificationUrl,
} as const;

const TRACE_PLOT_COLUMNS = {
  plotCode: plots.plotCode,
  name: plots.name,
  areaSqm: plots.areaSqm,
  soilTestResult: plots.soilTestResult,
  waterTestResult: plots.waterTestResult,
} as const;

const TRACE_SEASON_COLUMNS = {
  id: seasons.id,
  seasonName: seasons.seasonName,
  startDate: seasons.startDate,
  expectedHarvestDate: seasons.expectedHarvestDate,
  status: seasons.status,
} as const;

const TRACE_LOG_COLUMNS = {
  id: farmingLogs.id,
  actionType: farmingLogs.actionType,
  description: farmingLogs.description,
  mediaUrls: farmingLogs.mediaUrls,
  correctsLogId: farmingLogs.correctsLogId,
  loggedAt: farmingLogs.loggedAt,
} as const;

/**
 * Serves public batch QR traceability records with Redis cache-aside,
 * singleflight miss coalescing, and redacted historical provenance projections.
 */
@Injectable()
export class TraceService {
  private readonly logger = new Logger(TraceService.name);
  private readonly inflightReads = new Map<
    string,
    Promise<TraceRecordProjection>
  >();

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
    private readonly traceCacheService: TraceCacheService,
  ) {}

  /**
   * Resolves the redacted public provenance record for a normalized batch code.
   *
   * @param batchCode Trimmed uppercase batch code.
   * @returns Public batch traceability projection.
   */
  async getTraceByBatchCode(batchCode: string): Promise<TraceRecordProjection> {
    const startedAtMs = Date.now();
    const cached = await this.traceCacheService.readCachedTrace(batchCode);

    if (cached.status === "negative_hit") {
      this.logOutcome(batchCode, "negative_hit", startedAtMs);
      throw new NotFoundException({
        code: API_ERROR_CODES.BATCH_NOT_FOUND,
        detail: MESSAGES.BATCHES.NOT_FOUND,
      });
    }

    if (cached.status === "hit") {
      this.logOutcome(batchCode, "hit", startedAtMs);
      return cached.data;
    }

    const existingRead = this.inflightReads.get(batchCode);
    if (existingRead) {
      const data = await existingRead;
      this.logOutcome(batchCode, "coalesced_miss", startedAtMs);
      return data;
    }

    const loadPromise = this.loadAndBackfill(
      batchCode,
      cached.redisError,
    ).finally(() => {
      this.inflightReads.delete(batchCode);
    });
    this.inflightReads.set(batchCode, loadPromise);

    const data = await loadPromise;
    this.logOutcome(
      batchCode,
      cached.redisError ? "redis_fallback" : "miss",
      startedAtMs,
    );
    return data;
  }

  private async loadAndBackfill(
    batchCode: string,
    redisDegraded: boolean,
  ): Promise<TraceRecordProjection> {
    const readStartedAtMs = Date.now();
    const farmVersion = redisDegraded
      ? null
      : await this.traceCacheService.ensureFarmVersion();

    // Omit deletedAt filters on products and plots so QR labels on historical packaging stay resolvable.
    const [provenance] = await this.db
      .select({
        batch: TRACE_BATCH_COLUMNS,
        product: TRACE_PRODUCT_COLUMNS,
        season: TRACE_SEASON_COLUMNS,
        plot: TRACE_PLOT_COLUMNS,
        farm: TRACE_FARM_COLUMNS,
      })
      .from(batches)
      .innerJoin(products, eq(batches.productId, products.id))
      .innerJoin(seasons, eq(batches.seasonId, seasons.id))
      .innerJoin(plots, eq(seasons.plotId, plots.id))
      .innerJoin(farms, eq(plots.farmId, farms.id))
      .where(eq(batches.batchCode, batchCode))
      .limit(1);

    if (!provenance) {
      if (!redisDegraded) {
        await this.traceCacheService.writeNegativeCache(batchCode);
      }
      throw new NotFoundException({
        code: API_ERROR_CODES.BATCH_NOT_FOUND,
        detail: MESSAGES.BATCHES.NOT_FOUND,
      });
    }

    const targetLog = alias(farmingLogs, "trace_target_log");
    const latestRowsDesc = await this.db
      .select({
        totalCount: sql<number>`COUNT(*) OVER()`,
        log: TRACE_LOG_COLUMNS,
        recordedByName: users.fullName,
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
      .where(eq(farmingLogs.seasonId, provenance.season.id))
      .orderBy(desc(farmingLogs.loggedAt), desc(farmingLogs.id))
      .limit(TRACE_MAX_FARMING_LOGS);

    const totalLogCount = Number(latestRowsDesc[0]?.totalCount ?? 0);
    const logsTruncated = totalLogCount > TRACE_MAX_FARMING_LOGS;

    // Query latest N logs descending so truncation drops oldest entries while display stays chronological.
    const chronologicalRows = latestRowsDesc.toReversed();

    const correctedByMap = new Map<string, TraceLogCorrectionRef[]>();
    if (chronologicalRows.length > 0) {
      const logIds = chronologicalRows.map((entry) => entry.log.id);
      const correctionRows = await this.db
        .select({
          id: farmingLogs.id,
          correctsLogId: farmingLogs.correctsLogId,
          loggedAt: farmingLogs.loggedAt,
          recordedByName: users.fullName,
        })
        .from(farmingLogs)
        .innerJoin(users, eq(farmingLogs.staffId, users.id))
        .where(inArray(farmingLogs.correctsLogId, logIds))
        .orderBy(asc(farmingLogs.loggedAt), asc(farmingLogs.id));

      for (const correction of correctionRows) {
        if (!correction.correctsLogId) continue;
        const list = correctedByMap.get(correction.correctsLogId) ?? [];
        list.push({
          id: correction.id,
          loggedAt: correction.loggedAt.toISOString(),
          recordedByName: correction.recordedByName,
        });
        correctedByMap.set(correction.correctsLogId, list);
      }
    }

    const projection: TraceRecordProjection = {
      batch: {
        id: provenance.batch.id,
        batchCode: provenance.batch.batchCode,
        harvestDate: provenance.batch.harvestDate,
        expirationDate: provenance.batch.expirationDate,
        status: provenance.batch.status,
      },
      product: {
        id: provenance.product.id,
        name: provenance.product.name,
        slug: provenance.product.slug,
        unit: provenance.product.unit,
        imageUrls: provenance.product.imageUrls ?? [],
      },
      farm: {
        name: provenance.farm.name,
        legalName: provenance.farm.legalName,
        tagline: provenance.farm.tagline,
        address: provenance.farm.address,
        certificationUrl: provenance.farm.certificationUrl,
      },
      plot: {
        plotCode: provenance.plot.plotCode,
        name: provenance.plot.name,
        areaSqm: Number(provenance.plot.areaSqm),
        soilTestResult: provenance.plot.soilTestResult,
        waterTestResult: provenance.plot.waterTestResult,
      },
      season: {
        id: provenance.season.id,
        seasonName: provenance.season.seasonName,
        startDate: provenance.season.startDate,
        expectedHarvestDate: provenance.season.expectedHarvestDate,
        status: provenance.season.status,
      },
      farmingLogs: chronologicalRows.map((row) => {
        const correctsLog: TraceLogTargetSummary | null =
          row.log.correctsLogId && row.targetLog?.id
            ? {
                id: row.targetLog.id,
                actionType: row.targetLog.actionType,
                description: row.targetLog.description,
                loggedAt: row.targetLog.loggedAt.toISOString(),
              }
            : null;

        return {
          id: row.log.id,
          actionType: row.log.actionType,
          description: row.log.description,
          mediaUrls: row.log.mediaUrls ?? [],
          recordedByName: row.recordedByName,
          correctsLogId: row.log.correctsLogId,
          correctsLog,
          correctedBy: correctedByMap.get(row.log.id) ?? [],
          loggedAt: row.log.loggedAt.toISOString(),
        };
      }),
      totalLogCount,
      logsTruncated,
    };

    if (!redisDegraded && farmVersion) {
      await this.traceCacheService.backfillTrace(
        batchCode,
        farmVersion,
        projection,
        readStartedAtMs,
      );
    }

    return projection;
  }

  private logOutcome(
    batchCode: string,
    cacheOutcome:
      | "hit"
      | "negative_hit"
      | "miss"
      | "coalesced_miss"
      | "redis_fallback",
    startedAtMs: number,
  ): void {
    this.logger.debug(
      JSON.stringify({
        event: "trace_lookup",
        batchCode,
        cacheOutcome,
        durationMs: Date.now() - startedAtMs,
      }),
    );
  }
}
