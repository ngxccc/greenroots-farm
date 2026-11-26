import { Injectable } from "@nestjs/common";
import { BUSINESS_RULES } from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import { GEOCODING_TIMEOUT_MS } from "../geocoding.constant";
import type {
  GeocodingDriver,
  PlaceSuggestion,
  ResolvedPlace,
} from "../geocoding.interface";

const GOONG_PLACE_BASE_URL = "https://rsapi.goong.io/Place";
const HCMC_BIAS_LOCATION = "10.7769,106.7009";
const HCMC_BIAS_RADIUS_KM = "50";

interface GoongAutocompletePrediction {
  readonly place_id?: string;
  readonly description?: string;
  readonly compound?: {
    readonly commune?: string;
    readonly district?: string;
  };
}

interface GoongAutocompleteResponse {
  readonly status?: string;
  readonly predictions?: readonly GoongAutocompletePrediction[];
}

interface GoongPlaceDetailResponse {
  readonly status?: string;
  readonly result?: {
    readonly place_id?: string;
    readonly formatted_address?: string;
    readonly compound?: {
      readonly commune?: string;
      readonly district?: string;
    };
    readonly geometry?: {
      readonly location?: {
        readonly lat?: number;
        readonly lng?: number;
      };
    };
  };
}

/**
 * Strips `api_key` query parameters and raw API key values from error strings (`INV-GEO-2`).
 */
export function redactGoongSecrets(message: string, apiKey?: string): string {
  let sanitized = message.replace(/([?&]api_key=)[^&\s]+/gi, "$1[REDACTED]");
  if (apiKey && apiKey.length > 0) {
    sanitized = sanitized.split(apiKey).join("[REDACTED]");
  }
  return sanitized;
}

/**
 * Live Goong Maps Place Autocomplete and Place Detail adapter (`GEOCODING_DRIVER=goong`).
 */
@Injectable()
export class GoongGeocodingDriver implements GeocodingDriver {
  private getApiKey(): string {
    const key = env.GOONG_API_KEY?.trim();
    if (!key) {
      throw new Error("GOONG_API_KEY is not configured");
    }
    return key;
  }

  async autocomplete(query: string): Promise<PlaceSuggestion[]> {
    const apiKey = this.getApiKey();
    const url = new URL(`${GOONG_PLACE_BASE_URL}/AutoComplete`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("input", query);
    url.searchParams.set("location", HCMC_BIAS_LOCATION);
    url.searchParams.set("radius", HCMC_BIAS_RADIUS_KM);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        signal: AbortSignal.timeout(GEOCODING_TIMEOUT_MS),
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Goong autocomplete failed";
      const redacted = redactGoongSecrets(msg, apiKey);
      throw new Error(redacted, { cause: error });
    }

    if (!response.ok) {
      throw new Error(`Goong autocomplete HTTP ${response.status}`);
    }

    const payload = (await response.json()) as GoongAutocompleteResponse;
    const predictions: readonly GoongAutocompletePrediction[] = Array.isArray(
      payload.predictions,
    )
      ? (payload.predictions as readonly GoongAutocompletePrediction[])
      : [];

    const suggestions: PlaceSuggestion[] = [];
    for (const item of predictions) {
      if (
        typeof item.place_id === "string" &&
        item.place_id.length > 0 &&
        typeof item.description === "string" &&
        item.description.length > 0
      ) {
        const rawWard =
          item.compound?.commune?.trim() ?? item.compound?.district?.trim();
        const streetPart = item.description
          .split(",")
          .map((s) => s.trim())
          .find((s) => s.length > 0);
        suggestions.push({
          placeId: item.place_id,
          description: item.description,
          ward:
            rawWard && rawWard.length > 0
              ? rawWard
              : BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
          ...(streetPart ? { streetName: streetPart } : {}),
        });
      }
    }
    return suggestions;
  }

  async resolvePlace(placeId: string): Promise<ResolvedPlace | null> {
    const apiKey = this.getApiKey();
    const url = new URL(`${GOONG_PLACE_BASE_URL}/Detail`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("place_id", placeId);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        signal: AbortSignal.timeout(GEOCODING_TIMEOUT_MS),
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Goong place detail failed";
      const redacted = redactGoongSecrets(msg, apiKey);
      throw new Error(redacted, { cause: error });
    }

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Goong place detail HTTP ${response.status}`);
    }

    const payload = (await response.json()) as GoongPlaceDetailResponse;
    if (
      payload.status === "NOT_FOUND" ||
      payload.status === "INVALID_REQUEST"
    ) {
      return null;
    }

    const lat = payload.result?.geometry?.location?.lat;
    const lng = payload.result?.geometry?.location?.lng;
    if (
      typeof lat !== "number" ||
      !Number.isFinite(lat) ||
      typeof lng !== "number" ||
      !Number.isFinite(lng)
    ) {
      return null;
    }

    const rawWard =
      payload.result?.compound?.commune?.trim() ??
      payload.result?.compound?.district?.trim();
    const ward =
      rawWard && rawWard.length > 0
        ? rawWard
        : BUSINESS_RULES.DEFAULT_DELIVERY_CITY;
    const rawFormatted = payload.result?.formatted_address?.trim();
    const formattedAddress =
      rawFormatted && rawFormatted.length > 0 ? rawFormatted : ward;
    const rawPlaceId = payload.result?.place_id?.trim();

    return {
      placeId: rawPlaceId && rawPlaceId.length > 0 ? rawPlaceId : placeId,
      latitude: lat,
      longitude: lng,
      ward,
      formattedAddress,
    };
  }
}
