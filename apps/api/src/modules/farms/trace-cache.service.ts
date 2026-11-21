import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { RedisService } from "@/common/services/redis.service";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
} from "@/database/database.module";
import { batches, seasons } from "@/database/schemas";
import { traceRecordSchema, type TraceRecordProjection } from "./dto";
import {
  TRACE_CACHE_PREFIX,
  TRACE_CACHE_TTL_SECONDS,
  TRACE_FARM_VERSION_KEY,
  TRACE_INVALIDATED_AT_PREFIX,
  TRACE_INVALIDATION_MARKER_TTL_SECONDS,
  TRACE_MISS_CACHE_PREFIX,
  TRACE_MISS_TTL_SECONDS,
} from "./farms.constant";

// Backfill only if farm_ver matches the read snapshot, the cached entry does not
// already carry that farm_ver prefix, and no batch invalidation raced past readStartedAtMs.
const BACKFILL_TRACE_LUA = `
if redis.call("GET", KEYS[3]) ~= ARGV[4] then
  return 0
end
local existing = redis.call("GET", KEYS[1])
if existing and string.sub(existing, 1, #ARGV[4] + 1) == (ARGV[4] .. "|") then
  return 0
end
local invalidatedAt = redis.call("GET", KEYS[2])
if invalidatedAt and tonumber(invalidatedAt) >= tonumber(ARGV[2]) then
  return 0
end
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[3])
return 1
`;

/**
 * Outcome returned by `TraceCacheService.readCachedTrace` for a batch lookup.
 */
export type TraceCacheReadResult =
  | { readonly status: "hit"; readonly data: TraceRecordProjection }
  | { readonly status: "negative_hit" }
  | { readonly status: "miss"; readonly redisError: boolean };

/**
 * Manages fail-open Redis cache-aside reads, UUID farm-epoch versioning,
 * 30s negative miss markers, and race-safe `UNLINK` invalidation for batch traces.
 */
@Injectable()
export class TraceCacheService {
  private readonly logger = new Logger(TraceCacheService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Reads a cached batch trace or negative-miss marker in a single Redis `MGET` round-trip.
   *
   * @param batchCode Normalized uppercase batch code.
   * @returns Cache hit, negative hit, or miss status (failing open on Redis errors).
   */
  async readCachedTrace(batchCode: string): Promise<TraceCacheReadResult> {
    let mgetResult: (string | null)[];

    try {
      mgetResult = await this.redisService
        .getClient()
        .mget(
          this.traceKey(batchCode),
          this.missKey(batchCode),
          TRACE_FARM_VERSION_KEY,
        );
    } catch (error) {
      this.logger.warn(
        `Redis trace cache read failed for ${batchCode} (${this.errorMessage(error)}); falling back to PostgreSQL.`,
      );
      return { status: "miss", redisError: true };
    }

    const [cacheRaw = null, missRaw = null, farmVersion = null] = mgetResult;

    if (missRaw !== null) {
      return { status: "negative_hit" };
    }

    if (!cacheRaw || !farmVersion) {
      return { status: "miss", redisError: false };
    }

    const parsedEnvelope = this.parseCachedEnvelope(batchCode, cacheRaw);
    if (!parsedEnvelope || parsedEnvelope.farmVersion !== farmVersion) {
      return { status: "miss", redisError: false };
    }

    return { status: "hit", data: parsedEnvelope.data };
  }

  /**
   * Ensures `trace:farm_ver:v1` holds an opaque UUID nonce before DB backfill,
   * preventing post-eviction integer version collisions.
   *
   * @returns Active farm version nonce, or `null` if Redis is unavailable.
   */
  async ensureFarmVersion(): Promise<string | null> {
    try {
      const client = this.redisService.getClient();
      const existing = await client.get(TRACE_FARM_VERSION_KEY);
      if (existing) {
        return existing;
      }

      await client.set(TRACE_FARM_VERSION_KEY, randomUUID(), "NX");
      return await client.get(TRACE_FARM_VERSION_KEY);
    } catch (error) {
      this.logger.warn(
        `Failed to resolve trace farm version in Redis (${this.errorMessage(error)}).`,
      );
      return null;
    }
  }

  /**
   * Atomically backfills a serialized trace projection via Lua if `trace:farm_ver:v1`
   * still matches `farmVersion` and no concurrent write invalidated the batch code
   * after `readStartedAtMs`.
   *
   * @param batchCode Normalized uppercase batch code.
   * @param farmVersion Farm epoch nonce observed before the DB read.
   * @param data Complete redacted public trace projection.
   * @param readStartedAtMs Epoch milliseconds captured before reading PostgreSQL.
   */
  async backfillTrace(
    batchCode: string,
    farmVersion: string,
    data: TraceRecordProjection,
    readStartedAtMs: number,
  ): Promise<void> {
    try {
      const payload = `${farmVersion}|${JSON.stringify(data)}`;
      await this.redisService
        .getClient()
        .eval(
          BACKFILL_TRACE_LUA,
          3,
          this.traceKey(batchCode),
          this.invalidatedAtKey(batchCode),
          TRACE_FARM_VERSION_KEY,
          payload,
          String(readStartedAtMs),
          String(TRACE_CACHE_TTL_SECONDS),
          farmVersion,
        );
    } catch (error) {
      this.logger.warn(
        `Redis trace cache backfill failed for ${batchCode}: ${this.errorMessage(error)}`,
      );
    }
  }

  /**
   * Stores a 30-second negative-cache marker for a syntactically valid missing batch code.
   *
   * @param batchCode Normalized uppercase batch code.
   */
  async writeNegativeCache(batchCode: string): Promise<void> {
    try {
      await this.redisService
        .getClient()
        .set(this.missKey(batchCode), "1", "EX", TRACE_MISS_TTL_SECONDS);
    } catch (error) {
      this.logger.warn(
        `Redis negative trace cache write failed for ${batchCode}: ${this.errorMessage(error)}`,
      );
    }
  }

  /**
   * Rotates the singleton farm epoch nonce in `O(1)` after `farms` updates commit.
   */
  async rotateFarmVersion(): Promise<void> {
    try {
      await this.redisService
        .getClient()
        .set(TRACE_FARM_VERSION_KEY, randomUUID());
    } catch (error) {
      this.logger.error(
        `Failed to rotate trace farm version after commit: ${this.errorMessage(error)}`,
      );
    }
  }

  /**
   * Invalidates cached trace projections and negative-cache markers for a list of batch codes.
   * Exported through `FarmsModule` for downstream batch/inventory/order mutations.
   *
   * @param batchCodes Raw or normalized batch codes to unlink.
   */
  async invalidateByBatchCodes(batchCodes: readonly string[]): Promise<void> {
    const normalizedCodes = Array.from(
      new Set(
        batchCodes
          .map((code) => code.trim().toUpperCase())
          .filter((code) => code.length > 0),
      ),
    );
    if (normalizedCodes.length === 0) {
      return;
    }

    try {
      const nowMs = String(Date.now());
      const pipeline = this.redisService.getClient().pipeline();

      for (const code of normalizedCodes) {
        pipeline.unlink(this.traceKey(code), this.missKey(code));
        pipeline.set(
          this.invalidatedAtKey(code),
          nowMs,
          "EX",
          TRACE_INVALIDATION_MARKER_TTL_SECONDS,
        );
      }

      const results = await pipeline.exec();
      const failed = results?.some(([cmdError]) => cmdError !== null) ?? true;
      if (failed) {
        this.logger.error(
          `Redis pipeline returned a command error while invalidating batch traces (${normalizedCodes.join(", ")}).`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to invalidate trace Redis cache after commit: ${this.errorMessage(error)}`,
      );
    }
  }

  /**
   * Invalidates cached trace projections for every batch belonging to a cultivation season.
   *
   * @param seasonId Season UUIDv7 whose logs or metadata changed.
   */
  async invalidateBySeasonId(seasonId: string): Promise<void> {
    try {
      const rows = await this.db
        .select({ batchCode: batches.batchCode })
        .from(batches)
        .where(eq(batches.seasonId, seasonId));

      await this.invalidateByBatchCodes(rows.map((row) => row.batchCode));
    } catch (error) {
      this.logger.error(
        `Failed to query/invalidate trace cache for season ${seasonId}: ${this.errorMessage(error)}`,
      );
    }
  }

  /**
   * Invalidates cached trace projections for every batch produced on a cultivation plot.
   *
   * @param plotId Plot UUIDv7 whose metadata or laboratory results changed.
   */
  async invalidateByPlotId(plotId: string): Promise<void> {
    try {
      const rows = await this.db
        .select({ batchCode: batches.batchCode })
        .from(batches)
        .innerJoin(seasons, eq(batches.seasonId, seasons.id))
        .where(eq(seasons.plotId, plotId));

      await this.invalidateByBatchCodes(rows.map((row) => row.batchCode));
    } catch (error) {
      this.logger.error(
        `Failed to query/invalidate trace cache for plot ${plotId}: ${this.errorMessage(error)}`,
      );
    }
  }

  private parseCachedEnvelope(
    batchCode: string,
    raw: string,
  ): { farmVersion: string; data: TraceRecordProjection } | null {
    const separatorIdx = raw.indexOf("|");
    if (separatorIdx <= 0) {
      this.logger.warn(
        `Cached trace payload for ${batchCode} lacked epoch prefix; falling back to PostgreSQL.`,
      );
      return null;
    }

    const farmVersion = raw.slice(0, separatorIdx);
    const jsonBody = raw.slice(separatorIdx + 1);

    try {
      const parsed = traceRecordSchema.safeParse(JSON.parse(jsonBody));
      if (!parsed.success) {
        this.logger.warn(
          `Cached trace payload for ${batchCode} failed schema check; falling back to PostgreSQL.`,
        );
        return null;
      }

      return { farmVersion, data: parsed.data };
    } catch {
      this.logger.warn(
        `Cached trace payload for ${batchCode} contained malformed JSON; falling back to PostgreSQL.`,
      );
      return null;
    }
  }

  private traceKey(batchCode: string): string {
    return `${TRACE_CACHE_PREFIX}${batchCode}`;
  }

  private missKey(batchCode: string): string {
    return `${TRACE_MISS_CACHE_PREFIX}${batchCode}`;
  }

  private invalidatedAtKey(batchCode: string): string {
    return `${TRACE_INVALIDATED_AT_PREFIX}${batchCode}`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
