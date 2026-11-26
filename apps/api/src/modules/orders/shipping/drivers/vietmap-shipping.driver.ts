import { Injectable, Logger } from "@nestjs/common";
import type { GeoCoordinate } from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import { RedisService } from "@/common/services/redis.service";
import { TraceCacheService } from "@/modules/farms/trace-cache.service";
import { redactVietmapSecrets } from "@/modules/geocoding/drivers/vietmap-geocoding.driver";
import { SHIPPING_ROUTE_TIMEOUT_MS } from "../shipping.constant";
import type {
  ShippingDriver,
  ShippingDriverQuote,
  ShippingQuoteInput,
} from "../shipping.interface";
import { HaversineShippingDriver } from "./haversine-shipping.driver";
import { calculateCachedRoadQuote } from "./road-distance-shipping.helper";

const VIETMAP_MATRIX_URL = "https://maps.vietmap.vn/api/matrix/v4";

interface VietmapMatrixResponse {
  readonly distances?: readonly (readonly number[])[];
}

/**
 * Live Vietmap Maps API v4 Matrix (`vehicle=motorcycle`) shipping driver
 * (`SHIPPING_DRIVER=vietmap`) with 24h `farm_ver`-keyed Redis caching and
 * automatic fallback to `HaversineShippingDriver` (`INV-SHIP-1`).
 */
@Injectable()
export class VietmapShippingDriver implements ShippingDriver {
  private readonly logger = new Logger(VietmapShippingDriver.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly traceCacheService: TraceCacheService,
    private readonly haversineDriver: HaversineShippingDriver,
  ) {}

  async calculateQuote(
    input: ShippingQuoteInput,
  ): Promise<ShippingDriverQuote> {
    const apiKey = env.VIETMAP_API_KEY?.trim();

    return calculateCachedRoadQuote({
      driverName: "vietmap",
      input,
      redisService: this.redisService,
      traceCacheService: this.traceCacheService,
      haversineDriver: this.haversineDriver,
      logger: this.logger,
      redactError: (msg) => redactVietmapSecrets(msg, apiKey),
      fetchRoadDistanceKm: (origin, destination) =>
        this.fetchDistanceKm(origin, destination, apiKey),
    });
  }

  private async fetchDistanceKm(
    origin: GeoCoordinate,
    destination: GeoCoordinate,
    apiKey: string | undefined,
  ): Promise<number> {
    if (!apiKey) {
      throw new Error("VIETMAP_API_KEY is not configured");
    }

    const url = new URL(VIETMAP_MATRIX_URL);
    url.searchParams.set("apikey", apiKey);
    url.searchParams.append("point", `${origin.latitude},${origin.longitude}`);
    url.searchParams.append(
      "point",
      `${destination.latitude},${destination.longitude}`,
    );
    url.searchParams.set("sources", "0");
    url.searchParams.set("destinations", "1");
    url.searchParams.set("vehicle", "motorcycle");
    url.searchParams.set("annotation", "distance");

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        signal: AbortSignal.timeout(SHIPPING_ROUTE_TIMEOUT_MS),
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Vietmap matrix failed";
      throw new Error(redactVietmapSecrets(msg, apiKey), { cause: error });
    }

    // Check response.ok before JSON parsing because Vietmap 401 returns empty body and 423 returns plain text.
    if (!response.ok) {
      throw new Error(`Vietmap matrix HTTP ${response.status}`);
    }

    const payload = (await response.json()) as VietmapMatrixResponse;
    const distances: readonly (readonly number[])[] = Array.isArray(
      payload.distances,
    )
      ? (payload.distances as readonly (readonly number[])[])
      : [];
    const firstRow: readonly number[] = Array.isArray(distances[0])
      ? (distances[0] as readonly number[])
      : [];
    const distanceMeters = firstRow[0];

    if (
      typeof distanceMeters !== "number" ||
      !Number.isFinite(distanceMeters) ||
      distanceMeters < 0
    ) {
      throw new Error("Vietmap matrix returned no valid route");
    }

    return distanceMeters / 1000;
  }
}
