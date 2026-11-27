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

type VietmapVehicle = "motorcycle" | "car";

interface VietmapMatrixResponse {
  readonly code?: string;
  readonly messages?: readonly string[];
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

    const motoPayload = await this.fetchMatrixPayload(
      origin,
      destination,
      apiKey,
      "motorcycle",
    );
    const motoDistance = this.extractDistanceMeters(motoPayload);
    if (motoDistance !== null) {
      return motoDistance / 1000;
    }

    // Vietmap's motorcycle graph returns distances[0][0] = -1 for some valid urban segments where car routes cleanly.
    const carPayload = await this.fetchMatrixPayload(
      origin,
      destination,
      apiKey,
      "car",
    );
    const carDistance = this.extractDistanceMeters(carPayload);
    if (carDistance !== null) {
      return carDistance / 1000;
    }

    const motoRaw = motoPayload.distances?.[0]?.[0];
    const carRaw = carPayload.distances?.[0]?.[0];
    throw new Error(
      `Vietmap matrix returned no valid route (motorcycle=${String(motoRaw)}, car=${String(carRaw)})`,
    );
  }

  private async fetchMatrixPayload(
    origin: GeoCoordinate,
    destination: GeoCoordinate,
    apiKey: string,
    vehicle: VietmapVehicle,
  ): Promise<VietmapMatrixResponse> {
    const url = new URL(VIETMAP_MATRIX_URL);
    url.searchParams.set("apikey", apiKey);
    url.searchParams.append("point", `${origin.latitude},${origin.longitude}`);
    url.searchParams.append(
      "point",
      `${destination.latitude},${destination.longitude}`,
    );
    url.searchParams.set("sources", "0");
    url.searchParams.set("destinations", "1");
    url.searchParams.set("vehicle", vehicle);
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
    if (payload.code && payload.code !== "OK") {
      const detail = payload.messages?.filter(Boolean).join("; ");
      throw new Error(
        detail
          ? `Vietmap matrix ${payload.code}: ${detail}`
          : `Vietmap matrix ${payload.code}`,
      );
    }

    return payload;
  }

  private extractDistanceMeters(payload: VietmapMatrixResponse): number | null {
    const distanceMeters = payload.distances?.[0]?.[0];
    if (
      typeof distanceMeters !== "number" ||
      !Number.isFinite(distanceMeters) ||
      distanceMeters < 0
    ) {
      return null;
    }
    return distanceMeters;
  }
}
