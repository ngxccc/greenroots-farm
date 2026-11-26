import type { components } from "@/types/api-schema";

/**
 * Place autocomplete suggestion returned by `GET /api/v1/geocoding/autocomplete`.
 */
export type PlaceSuggestion = components["schemas"]["PlaceSuggestionDto"];
