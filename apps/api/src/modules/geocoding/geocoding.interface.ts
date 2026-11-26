/**
 * Autocomplete suggestion returned to authenticated storefront customers.
 */
export interface PlaceSuggestion {
  readonly placeId: string;
  readonly description: string;
  readonly ward: string;
}

/**
 * Verified geographic coordinates and display metadata resolved from a `placeId`.
 */
export interface ResolvedPlace {
  readonly placeId: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly ward: string;
  readonly formattedAddress: string;
}

/**
 * Adapter seam for address autocomplete and server-side place resolution.
 */
export interface GeocodingDriver {
  autocomplete(query: string): Promise<PlaceSuggestion[]>;
  resolvePlace(placeId: string): Promise<ResolvedPlace | null>;
}
