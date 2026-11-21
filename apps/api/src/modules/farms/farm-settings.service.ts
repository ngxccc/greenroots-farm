import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { API_ERROR_CODES } from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import { RedisService } from "@/common/services/redis.service";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
} from "@/database/database.module";
import { farms } from "@/database/schemas";
import {
  farmSettingsSchema,
  type FarmSettings,
  type UpdateFarmSettingsInput,
} from "./dto";
import {
  FARM_SETTINGS_CACHE_KEY,
  FARM_SETTINGS_CACHE_TTL_SECONDS,
  FARM_SETTINGS_INVALIDATED_AT_KEY,
  FARM_SETTINGS_INVALIDATION_MARKER_TTL_SECONDS,
} from "./farms.constant";
import { TraceCacheService } from "./trace-cache.service";

const FARM_SETTINGS_COLUMNS = {
  id: farms.id,
  name: farms.name,
  legalName: farms.legalName,
  tagline: farms.tagline,
  taxId: farms.taxId,
  address: farms.address,
  latitude: farms.latitude,
  longitude: farms.longitude,
  certificationUrl: farms.certificationUrl,
  hotlines: farms.hotlines,
  emails: farms.emails,
  workingHours: farms.workingHours,
  bankInfo: farms.bankInfo,
  shippingConfig: farms.shippingConfig,
  flashSaleConfig: farms.flashSaleConfig,
  isPayosEnabled: farms.isPayosEnabled,
  isCodEnabled: farms.isCodEnabled,
  createdAt: farms.createdAt,
  updatedAt: farms.updatedAt,
} as const;

type FarmSettingsRow = Pick<
  typeof farms.$inferSelect,
  keyof typeof FARM_SETTINGS_COLUMNS
>;

// Only backfill when the cache is empty and no write invalidated it after the DB read started.
const BACKFILL_CACHE_LUA = `
if redis.call("EXISTS", KEYS[1]) == 1 then
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
 * Manages singleton farm operational settings with a 24-hour Redis cache-aside
 * read path, fail-open PostgreSQL fallback, and race-safe `UNLINK` invalidation.
 */
@Injectable()
export class FarmSettingsService {
  private readonly logger = new Logger(FarmSettingsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
    private readonly redisService: RedisService,
    private readonly traceCacheService: TraceCacheService,
  ) {}

  /**
   * Reads the singleton farm settings, preferring the 24-hour Redis cache and
   * falling back cleanly to PostgreSQL on cache misses or Redis outages.
   */
  async getSettings(): Promise<FarmSettings> {
    const cached = await this.readFromCache();
    if (cached) {
      return cached;
    }

    const readStartedAtMs = Date.now();
    const [row] = await this.db
      .select(FARM_SETTINGS_COLUMNS)
      .from(farms)
      .orderBy(asc(farms.createdAt))
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODES.FARM_NOT_FOUND,
        detail: MESSAGES.FARMS.NOT_FOUND,
      });
    }

    const settings = this.toFarmSettings(row);
    await this.backfillCache(settings, readStartedAtMs);
    return settings;
  }

  /**
   * Updates the singleton farm settings inside a serialized row-locked transaction
   * and invalidates the Redis cache immediately after commit.
   */
  async updateSettings(input: UpdateFarmSettingsInput): Promise<FarmSettings> {
    const updatedRow = await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select(FARM_SETTINGS_COLUMNS)
        .from(farms)
        .orderBy(asc(farms.createdAt))
        .limit(1)
        .for("update");

      if (!current) {
        throw new NotFoundException({
          code: API_ERROR_CODES.FARM_NOT_FOUND,
          detail: MESSAGES.FARMS.NOT_FOUND,
        });
      }

      const nextPayos = input.isPayosEnabled ?? current.isPayosEnabled;
      const nextCod = input.isCodEnabled ?? current.isCodEnabled;
      if (!nextPayos && !nextCod) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.FARM_PAYMENT_METHOD_REQUIRED,
          detail: MESSAGES.FARMS.PAYMENT_METHOD_REQUIRED,
        });
      }

      const patch = this.buildUpdatePatch(input);
      const [saved] = await tx
        .update(farms)
        .set(patch)
        .where(eq(farms.id, current.id))
        .returning(FARM_SETTINGS_COLUMNS);

      if (!saved) {
        throw new NotFoundException({
          code: API_ERROR_CODES.FARM_NOT_FOUND,
          detail: MESSAGES.FARMS.NOT_FOUND,
        });
      }

      return saved;
    });

    await this.invalidateCache();
    await this.traceCacheService.rotateFarmVersion();
    return this.toFarmSettings(updatedRow);
  }

  private buildUpdatePatch(
    input: UpdateFarmSettingsInput,
  ): Partial<typeof farms.$inferInsert> {
    const patch: Partial<typeof farms.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) patch.name = input.name;
    if (input.legalName !== undefined) patch.legalName = input.legalName;
    if (input.tagline !== undefined) patch.tagline = input.tagline;
    if (input.taxId !== undefined) patch.taxId = input.taxId;
    if (input.address !== undefined) patch.address = input.address;
    if (input.latitude !== undefined) {
      patch.latitude = input.latitude.toFixed(8);
    }
    if (input.longitude !== undefined) {
      patch.longitude = input.longitude.toFixed(8);
    }
    if (input.certificationUrl !== undefined) {
      patch.certificationUrl = input.certificationUrl;
    }
    if (input.hotlines !== undefined) patch.hotlines = input.hotlines;
    if (input.emails !== undefined) patch.emails = input.emails;
    if (input.workingHours !== undefined) {
      patch.workingHours = input.workingHours;
    }
    if (input.bankInfo !== undefined) patch.bankInfo = input.bankInfo;
    if (input.shippingConfig !== undefined) {
      patch.shippingConfig = input.shippingConfig;
    }
    if (input.flashSaleConfig !== undefined) {
      patch.flashSaleConfig = input.flashSaleConfig;
    }
    if (input.isPayosEnabled !== undefined) {
      patch.isPayosEnabled = input.isPayosEnabled;
    }
    if (input.isCodEnabled !== undefined) {
      patch.isCodEnabled = input.isCodEnabled;
    }

    return patch;
  }

  private toFarmSettings(row: FarmSettingsRow): FarmSettings {
    return {
      id: row.id,
      name: row.name,
      legalName: row.legalName,
      tagline: row.tagline,
      taxId: row.taxId,
      address: row.address,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      certificationUrl: row.certificationUrl,
      hotlines: row.hotlines,
      emails: row.emails,
      workingHours: row.workingHours,
      bankInfo: row.bankInfo,
      shippingConfig: row.shippingConfig,
      flashSaleConfig: row.flashSaleConfig,
      isPayosEnabled: row.isPayosEnabled,
      isCodEnabled: row.isCodEnabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async readFromCache(): Promise<FarmSettings | null> {
    try {
      const raw = await this.redisService
        .getClient()
        .get(FARM_SETTINGS_CACHE_KEY);
      if (!raw) return null;

      const parsed = farmSettingsSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        this.logger.warn(
          "Cached farm settings payload failed schema check; falling back to PostgreSQL.",
        );
        return null;
      }

      return parsed.data;
    } catch (error) {
      this.logger.warn(
        `Redis farm settings cache read failed (${error instanceof Error ? error.message : String(error)}); falling back to PostgreSQL.`,
      );
      return null;
    }
  }

  private async backfillCache(
    settings: FarmSettings,
    readStartedAtMs: number,
  ): Promise<void> {
    try {
      await this.redisService
        .getClient()
        .eval(
          BACKFILL_CACHE_LUA,
          2,
          FARM_SETTINGS_CACHE_KEY,
          FARM_SETTINGS_INVALIDATED_AT_KEY,
          JSON.stringify(settings),
          String(readStartedAtMs),
          String(FARM_SETTINGS_CACHE_TTL_SECONDS),
        );
    } catch (error) {
      this.logger.warn(
        `Redis farm settings cache backfill failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async invalidateCache(): Promise<void> {
    try {
      const pipeline = this.redisService.getClient().pipeline();
      pipeline.unlink(FARM_SETTINGS_CACHE_KEY);
      pipeline.set(
        FARM_SETTINGS_INVALIDATED_AT_KEY,
        String(Date.now()),
        "EX",
        FARM_SETTINGS_INVALIDATION_MARKER_TTL_SECONDS,
      );
      const results = await pipeline.exec();
      const failed = results?.some(([cmdError]) => cmdError !== null) ?? true;
      if (failed) {
        this.logger.error(
          "Redis pipeline returned a command error while invalidating farm settings cache.",
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to invalidate farm settings Redis cache after commit: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
