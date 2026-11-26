import { Injectable } from "@nestjs/common";
import { BUSINESS_RULES } from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import { GEOCODING_TIMEOUT_MS } from "../geocoding.constant";
import type {
  GeocodingDriver,
  PlaceSuggestion,
  ResolvedPlace,
} from "../geocoding.interface";

const VIETMAP_AUTOCOMPLETE_URL = "https://maps.vietmap.vn/api/autocomplete/v4";
const VIETMAP_PLACE_URL = "https://maps.vietmap.vn/api/place/v4";
const HCMC_FOCUS_LOCATION = "10.7769,106.7009";
const VIETMAP_DISPLAY_TYPE_TWO_LEVEL = "1";

interface VietmapBoundary {
  readonly type?: number;
  readonly name?: string;
  readonly full_name?: string;
}

interface VietmapAutocompleteItem {
  readonly ref_id?: string;
  readonly address?: string;
  readonly name?: string;
  readonly display?: string;
  readonly boundaries?: readonly VietmapBoundary[];
}

interface VietmapPlaceResponse {
  readonly display?: string;
  readonly address?: string;
  readonly ward?: string;
  readonly district?: string;
  readonly city?: string;
  readonly lat?: number;
  readonly lng?: number;
  readonly boundaries?: readonly VietmapBoundary[];
}

/**
 * Strips `apikey` query parameters and raw API key values from error strings (`INV-GEO-2`).
 */
export function redactVietmapSecrets(message: string, apiKey?: string): string {
  let sanitized = message.replace(/([?&]apikey=)[^&\s]+/gi, "$1[REDACTED]");
  if (apiKey && apiKey.length > 0) {
    sanitized = sanitized.split(apiKey).join("[REDACTED]");
  }
  return sanitized;
}

function extractWardFromParts(params: {
  readonly ward?: string;
  readonly boundaries?: readonly VietmapBoundary[];
  readonly address?: string;
  readonly district?: string;
}): string {
  const direct = params.ward?.trim();
  if (direct && direct.length > 0) {
    return direct;
  }

  const boundaries: readonly VietmapBoundary[] = Array.isArray(
    params.boundaries,
  )
    ? (params.boundaries as readonly VietmapBoundary[])
    : [];
  for (const boundary of boundaries) {
    if (boundary.type === 2) {
      const boundaryName = boundary.full_name?.trim() ?? boundary.name?.trim();
      if (boundaryName && boundaryName.length > 0) {
        return boundaryName;
      }
    }
  }

  if (params.address) {
    const segments = params.address
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const wardSegment = segments.find((s) =>
      /^(Phường|Xã|Thị trấn|Đặc khu)/i.test(s),
    );
    if (wardSegment) {
      return wardSegment;
    }
  }

  const district = params.district?.trim();
  if (district && district.length > 0) {
    return district;
  }

  return BUSINESS_RULES.DEFAULT_DELIVERY_CITY;
}

/**
 * Live Vietmap Maps API v4 Autocomplete and Place adapter (`GEOCODING_DRIVER=vietmap`)
 * using the 2-level administrative format (`display_type=1`: ward + province/city).
 */
@Injectable()
export class VietmapGeocodingDriver implements GeocodingDriver {
  private getApiKey(): string {
    const key = env.VIETMAP_API_KEY?.trim();
    if (!key) {
      throw new Error("VIETMAP_API_KEY is not configured");
    }
    return key;
  }

  async autocomplete(query: string): Promise<PlaceSuggestion[]> {
    const apiKey = this.getApiKey();
    const url = new URL(VIETMAP_AUTOCOMPLETE_URL);
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("text", query);
    url.searchParams.set("focus", HCMC_FOCUS_LOCATION);
    url.searchParams.set("display_type", VIETMAP_DISPLAY_TYPE_TWO_LEVEL);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        signal: AbortSignal.timeout(GEOCODING_TIMEOUT_MS),
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Vietmap autocomplete failed";
      const redacted = redactVietmapSecrets(msg, apiKey);
      throw new Error(redacted, { cause: error });
    }

    if (!response.ok) {
      throw new Error(`Vietmap autocomplete HTTP ${response.status}`);
    }

    const rawPayload: unknown = await response.json();
    const items: readonly VietmapAutocompleteItem[] = Array.isArray(rawPayload)
      ? (rawPayload as readonly VietmapAutocompleteItem[])
      : [];

    const suggestions: PlaceSuggestion[] = [];
    for (const item of items) {
      const refId = item.ref_id?.trim();
      const display = item.display?.trim() ?? item.name?.trim();
      if (refId && refId.length > 0 && display && display.length > 0) {
        const rawName = item.name?.trim();
        suggestions.push({
          placeId: refId,
          description: display,
          ward: extractWardFromParts({
            boundaries: item.boundaries,
            address: item.address ?? display,
          }),
          ...(rawName && rawName.length > 0 ? { streetName: rawName } : {}),
        });
      }
    }

    return suggestions;
  }

  async resolvePlace(placeId: string): Promise<ResolvedPlace | null> {
    const apiKey = this.getApiKey();
    const url = new URL(VIETMAP_PLACE_URL);
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("refid", placeId);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        signal: AbortSignal.timeout(GEOCODING_TIMEOUT_MS),
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Vietmap place detail failed";
      const redacted = redactVietmapSecrets(msg, apiKey);
      throw new Error(redacted, { cause: error });
    }

    if (response.status === 400 || response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Vietmap place detail HTTP ${response.status}`);
    }

    const payload = (await response.json()) as VietmapPlaceResponse;
    if (
      typeof payload.lat !== "number" ||
      !Number.isFinite(payload.lat) ||
      typeof payload.lng !== "number" ||
      !Number.isFinite(payload.lng)
    ) {
      return null;
    }

    const ward = extractWardFromParts({
      ward: payload.ward,
      boundaries: payload.boundaries,
      address: payload.address ?? payload.display,
      district: payload.district,
    });
    const rawDisplay = payload.display?.trim();
    const formattedAddress =
      rawDisplay && rawDisplay.length > 0 ? rawDisplay : ward;

    return {
      placeId,
      latitude: payload.lat,
      longitude: payload.lng,
      ward,
      formattedAddress,
    };
  }
}
