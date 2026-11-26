import { Injectable } from "@nestjs/common";
import { MOCK_PLACES } from "../geocoding.constant";
import type {
  GeocodingDriver,
  PlaceSuggestion,
  ResolvedPlace,
} from "../geocoding.interface";

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

/**
 * Deterministic offline geocoding driver backed by `MOCK_PLACES` for local
 * development and automated E2E tests (`GEOCODING_DRIVER=mock`).
 */
@Injectable()
export class MockGeocodingDriver implements GeocodingDriver {
  autocomplete(query: string): Promise<PlaceSuggestion[]> {
    const normalized = normalizeSearchText(query);
    if (normalized.length < 3) {
      return Promise.resolve([]);
    }

    const matches = MOCK_PLACES.filter((place) => {
      const haystack = normalizeSearchText(
        `${place.formattedAddress} ${place.district} ${place.placeId}`,
      );
      return haystack.includes(normalized);
    });

    const results = matches.length > 0 ? matches : MOCK_PLACES.slice(0, 5);

    return Promise.resolve(
      results.map((place) => ({
        placeId: place.placeId,
        description: place.formattedAddress,
        district: place.district,
      })),
    );
  }

  resolvePlace(placeId: string): Promise<ResolvedPlace | null> {
    const found = MOCK_PLACES.find((place) => place.placeId === placeId);
    return Promise.resolve(found ?? null);
  }
}
