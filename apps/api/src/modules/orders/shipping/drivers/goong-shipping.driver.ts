import { Injectable, Logger } from "@nestjs/common";
import type { GeoCoordinate } from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import { RedisService } from "@/common/services/redis.service";
import { TraceCacheService } from "@/modules/farms/trace-cache.service";
import { redactGoongSecrets } from "@/modules/geocoding/drivers/goong-geocoding.driver";
import { SHIPPING_ROUTE_TIMEOUT_MS } from "../shipping.constant";
import type {
  ShippingDriver,
  ShippingDriverQuote,
  ShippingQuoteInput,
} from "../shipping.interface";
import { HaversineShippingDriver } from "./haversine-shipping.driver";
import { calculateCachedRoadQuote } from "./road-distance-shipping.helper";

const GOONG_DISTANCE_MATRIX_URL = "https://rsapi.goong.io/DistanceMatrix";

interface GoongDistanceMatrixElement {
  readonly status?: string;
  readonly distance?: {
    readonly value?: number;
  };
}

interface GoongDistanceMatrixRow {
  readonly elements?: readonly GoongDistanceMatrixElement[];
}

interface GoongDistanceMatrixResponse {
  readonly rows?: readonly GoongDistanceMatrixRow[];
}

/**
 * Live Goong Maps Distance Matrix (`vehicle=bike`) shipping driver
 * (`SHIPPING_DRIVER=goong`) with 24h `farm_ver`-keyed Redis caching and
 * automatic fallback to `HaversineShippingDriver` (`INV-SHIP-1`).
 */
@Injectable()
export class GoongShippingDriver implements ShippingDriver {
  private readonly logger = new Logger(GoongShippingDriver.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly traceCacheService: TraceCacheService,
    private readonly haversineDriver: HaversineShippingDriver,
  ) {}

  async calculateQuote(
    input: ShippingQuoteInput,
  ): Promise<ShippingDriverQuote> {
    const apiKey = env.GOONG_API_KEY?.trim();

    return calculateCachedRoadQuote({
      driverName: "goong",
      input,
      redisService: this.redisService,
      traceCacheService: this.traceCacheService,
      haversineDriver: this.haversineDriver,
      logger: this.logger,
      redactError: (msg) => redactGoongSecrets(msg, apiKey),
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
      throw new Error("GOONG_API_KEY is not configured");
    }

    const url = new URL(GOONG_DISTANCE_MATRIX_URL);
    url.searchParams.set("origins", `${origin.latitude},${origin.longitude}`);
    url.searchParams.set(
      "destinations",
      `${destination.latitude},${destination.longitude}`,
    );
    url.searchParams.set("vehicle", "bike");
    url.searchParams.set("api_key", apiKey);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        signal: AbortSignal.timeout(SHIPPING_ROUTE_TIMEOUT_MS),
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Goong distance matrix failed";
      throw new Error(redactGoongSecrets(msg, apiKey), { cause: error });
    }

    if (!response.ok) {
      throw new Error(`Goong distance matrix HTTP ${response.status}`);
    }

    const payload = (await response.json()) as GoongDistanceMatrixResponse;
    const rows: readonly GoongDistanceMatrixRow[] = Array.isArray(payload.rows)
      ? (payload.rows as readonly GoongDistanceMatrixRow[])
      : [];
    const firstRow = rows[0];
    const elements: readonly GoongDistanceMatrixElement[] = Array.isArray(
      firstRow?.elements,
    )
      ? (firstRow.elements as readonly GoongDistanceMatrixElement[])
      : [];
    const element = elements[0];
    const distanceMeters = element?.distance?.value;

    if (
      element?.status !== "OK" ||
      typeof distanceMeters !== "number" ||
      !Number.isFinite(distanceMeters) ||
      distanceMeters < 0
    ) {
      throw new Error("Goong distance matrix returned no valid route");
    }

    return distanceMeters / 1000;
  }
}
