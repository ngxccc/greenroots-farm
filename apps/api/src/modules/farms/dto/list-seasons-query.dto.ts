import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { SeasonStatus } from "@greenroots/shared";
import {
  zNumericString,
  zSanitizedString,
  zUuidV7,
} from "@/common/schemas/zod-primitives";
import { SEASON_SORT_OPTIONS } from "../farms.interface";

/**
 * Zod schema for paginated season listing filters and sorting (`GET /api/v1/seasons`).
 */
export const listSeasonsQuerySchema = z
  .object({
    status: z.enum(SeasonStatus).optional(),
    plotId: zUuidV7().optional(),
    q: zSanitizedString({ min: 1, max: 100 }).optional(),
    page: zNumericString({ integer: true, min: 1 }).default(1),
    limit: zNumericString({ integer: true, min: 1, max: 100 }).default(20),
    sort: z.enum(SEASON_SORT_OPTIONS).default("createdAt:desc"),
  })
  .strict();

/**
 * Validated season listing query parameters.
 */
export type ListSeasonsQuery = z.infer<typeof listSeasonsQuerySchema>;

/**
 * Query parameters DTO for `GET /api/v1/seasons`.
 */
export class ListSeasonsQueryDto extends createZodDto(listSeasonsQuerySchema) {
  public static readonly zodSchema = listSeasonsQuerySchema;
}
