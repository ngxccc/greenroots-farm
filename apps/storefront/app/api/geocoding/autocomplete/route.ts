import { handleGeocodingAutocompleteGet } from "@/features/geocoding/api/autocomplete-handler";

/**
 * BFF Route Handler forwarding `GET /api/geocoding/autocomplete` to `GET /api/v1/geocoding/autocomplete`.
 */
export async function GET(request: Request) {
  return handleGeocodingAutocompleteGet(request);
}
