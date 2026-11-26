import type { Logger } from "@nestjs/common";
import {
  calculateDeliveryQuoteFromRoadDistance,
  calculateHaversineDistanceKm,
  type GeoCoordinate,
} from "@greenroots/shared";
import type { RedisService } from "@/common/services/redis.service";
import type { TraceCacheService } from "@/modules/farms/trace-cache.service";
import { SHIPPING_ROUTE_CACHE_TTL_SECONDS } from "../shipping.constant";
import type {
  ShippingDriverQuote,
  ShippingQuoteInput,
} from "../shipping.interface";
import type { HaversineShippingDriver } from "./haversine-shipping.driver";

const COORD_PRECISION = 5;

export interface CachedRoadQuoteParams {
  readonly driverName: "goong" | "vietmap";
  readonly input: ShippingQuoteInput;
  readonly redisService: RedisService;
  readonly traceCacheService: TraceCacheService;
  readonly haversineDriver: HaversineShippingDriver;
  readonly logger: Logger;
  readonly redactError: (message: string) => string;
  readonly fetchRoadDistanceKm: (
    origin: GeoCoordinate,
    destination: GeoCoordinate,
  ) => Promise<number>;
}

function formatCoord(coord: GeoCoordinate): string {
  return `${coord.latitude.toFixed(COORD_PRECISION)},${coord.longitude.toFixed(COORD_PRECISION)}`;
}

async function readCachedRoadKm(
  redisService: RedisService,
  cacheKey: string,
  logger: Logger,
): Promise<number | null> {
  try {
    const raw = await redisService.getClient().get(cacheKey);
    if (raw === null) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Shipping route cache read failed (${msg}).`);
    return null;
  }
}

async function writeCachedRoadKm(
  redisService: RedisService,
  cacheKey: string,
  roadDistanceKm: number,
  logger: Logger,
): Promise<void> {
  try {
    await redisService
      .getClient()
      .set(
        cacheKey,
        String(roadDistanceKm),
        "EX",
        SHIPPING_ROUTE_CACHE_TTL_SECONDS,
      );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Shipping route cache write failed (${msg}).`);
  }
}

/**
 * Resolves road distance via Redis cache (`farm_ver`-scoped, 24h TTL) or the
 * upstream routing provider, falling back to `HaversineShippingDriver` on any
 * upstream error (`INV-SHIP-1`) with redacted warning logs (`INV-GEO-2`).
 */
export async function calculateCachedRoadQuote(
  params: CachedRoadQuoteParams,
): Promise<ShippingDriverQuote> {
  const {
    driverName,
    input,
    redisService,
    traceCacheService,
    haversineDriver,
    logger,
    redactError,
    fetchRoadDistanceKm,
  } = params;

  const straightLineKm = calculateHaversineDistanceKm(
    input.origin.latitude,
    input.origin.longitude,
    input.destination.latitude,
    input.destination.longitude,
  );

  const farmVer = (await traceCacheService.ensureFarmVersion()) ?? "default";
  const cacheKey = `ship:${driverName}:v${farmVer}:${formatCoord(input.origin)}:${formatCoord(input.destination)}`;

  const cachedRoadKm = await readCachedRoadKm(redisService, cacheKey, logger);
  if (cachedRoadKm !== null) {
    return calculateDeliveryQuoteFromRoadDistance(
      straightLineKm,
      cachedRoadKm,
      input.config,
      { isSubscription: input.isSubscription },
    );
  }

  try {
    const roadDistanceKm = await fetchRoadDistanceKm(
      input.origin,
      input.destination,
    );
    await writeCachedRoadKm(redisService, cacheKey, roadDistanceKm, logger);
    return calculateDeliveryQuoteFromRoadDistance(
      straightLineKm,
      roadDistanceKm,
      input.config,
      { isSubscription: input.isSubscription },
    );
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    logger.warn(
      `Upstream ${driverName} shipping quote failed; falling back to Haversine (${redactError(rawMsg)}).`,
    );
    return haversineDriver.calculateQuote(input);
  }
}
