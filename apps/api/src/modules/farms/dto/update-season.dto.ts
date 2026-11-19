import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { SeasonStatus } from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  zIsoDate,
  zSanitizedString,
  zUuidV7,
} from "@/common/schemas/zod-primitives";

/**
 * Zod schema for updating or transitioning a cultivation season (`PATCH /api/v1/seasons/:id`).
 */
export const updateSeasonSchema = z
  .object({
    plotId: zUuidV7().optional(),
    seasonName: zSanitizedString({ min: 1, max: 255 }).optional(),
    startDate: zIsoDate().optional(),
    expectedHarvestDate: zIsoDate().optional(),
    status: z.enum(SeasonStatus).optional(),
  })
  .strict()
  .refine(
    (data) =>
      Object.values(data as Record<string, unknown>).some(
        (value) => value !== undefined,
      ),
    {
      message: MESSAGES.VALIDATION.AT_LEAST_ONE_SEASON_FIELD,
    },
  )
  .refine(
    (data) =>
      data.startDate === undefined ||
      data.expectedHarvestDate === undefined ||
      data.startDate <= data.expectedHarvestDate,
    {
      path: ["expectedHarvestDate"],
      message: MESSAGES.VALIDATION.SEASON_DATE_RANGE_INVALID,
    },
  );

/**
 * Validated partial update payload for `PATCH /api/v1/seasons/:id`.
 */
export type UpdateSeasonInput = z.infer<typeof updateSeasonSchema>;

/**
 * Request body DTO for `PATCH /api/v1/seasons/:id`.
 */
export class UpdateSeasonDto extends createZodDto(updateSeasonSchema) {
  public static readonly zodSchema = updateSeasonSchema;
}
