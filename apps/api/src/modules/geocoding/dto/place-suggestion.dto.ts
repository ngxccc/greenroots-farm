import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/**
 * Zod schema for a single Goong/mock place autocomplete suggestion.
 */
export const placeSuggestionSchema = z.object({
  placeId: z.string().min(1),
  description: z.string().min(1),
  ward: z.string().min(1),
  streetName: z.string().optional(),
});

/**
 * Place suggestion payload returned by `GET /api/v1/geocoding/autocomplete`.
 */
export type PlaceSuggestionDtoType = z.infer<typeof placeSuggestionSchema>;

/**
 * Response item DTO for `GET /api/v1/geocoding/autocomplete`.
 */
export class PlaceSuggestionDto extends createZodDto(placeSuggestionSchema) {
  public static readonly zodSchema = placeSuggestionSchema;
}
