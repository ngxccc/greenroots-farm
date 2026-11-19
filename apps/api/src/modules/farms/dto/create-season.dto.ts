import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  zIsoDate,
  zSanitizedString,
  zUuidV7,
} from "@/common/schemas/zod-primitives";

/**
 * Zod schema for creating a cultivation season (`POST /api/v1/seasons`).
 */
export const createSeasonSchema = z
  .object({
    plotId: zUuidV7(),
    seasonName: zSanitizedString({ min: 1, max: 255 }),
    startDate: zIsoDate(),
    expectedHarvestDate: zIsoDate(),
  })
  .strict()
  .refine((data) => data.startDate <= data.expectedHarvestDate, {
    path: ["expectedHarvestDate"],
    message: MESSAGES.VALIDATION.SEASON_DATE_RANGE_INVALID,
  });

/**
 * Validated payload for creating a cultivation season in `planning` status.
 */
export type CreateSeasonInput = z.infer<typeof createSeasonSchema>;

/**
 * Request body DTO for `POST /api/v1/seasons`.
 */
export class CreateSeasonDto extends createZodDto(createSeasonSchema) {
  public static readonly zodSchema = createSeasonSchema;
}
