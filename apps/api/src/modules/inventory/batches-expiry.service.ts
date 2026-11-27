import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { and, asc, eq, gt, inArray, lt, lte, type SQL } from "drizzle-orm";
import { BatchStatus } from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import { TIME_IN_MS } from "@/common/constants/time.constant";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
} from "@/database/database.module";
import { batches } from "@/database/schemas";
import { FarmSettingsService } from "@/modules/farms/farm-settings.service";
import { TraceCacheService } from "@/modules/farms/trace-cache.service";
import {
  BATCH_EXPIRY_SWEEP_BATCH_SIZE,
  BATCH_EXPIRY_SWEEP_INTERVAL_MS,
} from "./inventory.constant";
import { resolveFlashSaleHoursThreshold } from "./inventory.helper";

/**
 * Counts of batches transitioned during one `BatchesExpiryService.runSweep` execution.
 */
export interface BatchExpirySweepResult {
  readonly expired: number;
  readonly nearExpiry: number;
}

/**
 * Periodically transitions expired and near-expiry inventory batches in bounded chunks
 * (`INV-BEXP-1`..`INV-BEXP-5`) and invalidates public trace projections post-commit.
 */
@Injectable()
export class BatchesExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BatchesExpiryService.name);
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
    private readonly farmSettingsService: FarmSettingsService,
    private readonly traceCacheService: TraceCacheService,
  ) {}

  /**
   * Registers an unrefed 5-minute interval sweep outside the `test` environment.
   */
  onModuleInit(): void {
    if (env.NODE_ENV === "test") {
      return;
    }

    this.timer = setInterval(() => {
      void this.runSweep();
    }, BATCH_EXPIRY_SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  /**
   * Clears the active interval timer on module shutdown.
   */
  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Executes one two-pass batch lifecycle sweep unless another pass is already in flight.
   *
   * @param now Reference timestamp for deterministic expiry and flash-sale window evaluation.
   * @returns Number of batches transitioned to `EXPIRED` and `NEAR_EXPIRY`.
   */
  async runSweep(now: Date = new Date()): Promise<BatchExpirySweepResult> {
    if (this.isRunning) {
      return { expired: 0, nearExpiry: 0 };
    }

    this.isRunning = true;
    try {
      let expired = 0;
      let nearExpiry = 0;

      // Isolate Pass 1 (-> EXPIRED) from Pass 2 so FarmSettings failures cannot block expiry enforcement.
      try {
        expired = await this.transitionBatchesInChunks(
          and(
            inArray(batches.status, [
              BatchStatus.IN_STOCK,
              BatchStatus.NEAR_EXPIRY,
            ]),
            lte(batches.expirationDate, now),
          )!,
          BatchStatus.EXPIRED,
          now,
        );
        if (expired > 0) {
          this.logger.log(
            `Transitioned ${expired} expired batch(es) to EXPIRED.`,
          );
        }
      } catch (error) {
        this.logger.error(
          "Error occurred during expired batch sweep",
          error instanceof Error ? error.stack : String(error),
        );
      }

      try {
        const hoursThreshold = await resolveFlashSaleHoursThreshold(
          this.farmSettingsService,
          this.logger,
        );
        const cutoff = new Date(
          now.getTime() + hoursThreshold * TIME_IN_MS.HOUR,
        );

        nearExpiry = await this.transitionBatchesInChunks(
          and(
            eq(batches.status, BatchStatus.IN_STOCK),
            gt(batches.expirationDate, now),
            lt(batches.expirationDate, cutoff),
          )!,
          BatchStatus.NEAR_EXPIRY,
          now,
        );
        if (nearExpiry > 0) {
          this.logger.log(
            `Transitioned ${nearExpiry} batch(es) to NEAR_EXPIRY.`,
          );
        }
      } catch (error) {
        this.logger.error(
          "Error occurred during near-expiry batch sweep",
          error instanceof Error ? error.stack : String(error),
        );
      }

      return { expired, nearExpiry };
    } finally {
      this.isRunning = false;
    }
  }

  private async transitionBatchesInChunks(
    wherePredicate: SQL,
    targetStatus: BatchStatus,
    now: Date,
  ): Promise<number> {
    let totalTransitioned = 0;

    for (;;) {
      // Lock rows in ascending ID order with SKIP LOCKED to avoid deadlocks with OrdersService/WasteLogsService.
      const chunkCodes = await this.db.transaction(async (tx) => {
        const candidates = await tx
          .select({
            id: batches.id,
            batchCode: batches.batchCode,
          })
          .from(batches)
          .where(wherePredicate)
          .orderBy(asc(batches.id))
          .limit(BATCH_EXPIRY_SWEEP_BATCH_SIZE)
          .for("update", { skipLocked: true });

        if (candidates.length === 0) {
          return [];
        }

        await tx
          .update(batches)
          .set({
            status: targetStatus,
            updatedAt: now,
          })
          .where(
            inArray(
              batches.id,
              candidates.map((row) => row.id),
            ),
          );

        return candidates.map((row) => row.batchCode);
      });

      if (chunkCodes.length === 0) {
        break;
      }

      totalTransitioned += chunkCodes.length;

      // Invalidate trace projections strictly post-commit so readers never backfill pre-commit DB state.
      await this.traceCacheService.invalidateByBatchCodes(chunkCodes);

      if (chunkCodes.length < BATCH_EXPIRY_SWEEP_BATCH_SIZE) {
        break;
      }
    }

    return totalTransitioned;
  }
}
