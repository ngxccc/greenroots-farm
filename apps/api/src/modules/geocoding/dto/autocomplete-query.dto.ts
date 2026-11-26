import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";

/**
 * Zod schema for `GET /api/v1/geocoding/autocomplete` query parameters.
 */
export const autocompleteQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(3, { message: MESSAGES.VALIDATION.MIN_LENGTH })
      .max(200, { message: MESSAGES.VALIDATION.MAX_LENGTH }),
  })
  .strict();

/**
 * Validated query input for place autocomplete.
 */
export type AutocompleteQueryInput = z.infer<typeof autocompleteQuerySchema>;

/**
 * Query DTO for `GET /api/v1/geocoding/autocomplete`.
 */
export class AutocompleteQueryDto extends createZodDto(
  autocompleteQuerySchema,
) {
  public static readonly zodSchema = autocompleteQuerySchema;
}
