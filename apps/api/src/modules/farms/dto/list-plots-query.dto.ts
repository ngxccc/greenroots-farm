import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import {
  zNumericString,
  zSanitizedString,
} from "@/common/schemas/zod-primitives";
import { PLOT_SORT_OPTIONS } from "../farms.interface";

/**
 * Zod schema for paginated plot listing filters and sorting (`GET /api/v1/plots`).
 */
export const listPlotsQuerySchema = z
  .object({
    q: zSanitizedString({ min: 1, max: 100 }).optional(),
    page: zNumericString({ integer: true, min: 1 }).default(1),
    limit: zNumericString({ integer: true, min: 1, max: 100 }).default(20),
    sort: z.enum(PLOT_SORT_OPTIONS).default("createdAt:desc"),
  })
  .strict();

/**
 * Validated plot listing query parameters.
 */
export type ListPlotsQuery = z.infer<typeof listPlotsQuerySchema>;

/**
 * Query parameters DTO for `GET /api/v1/plots`.
 */
export class ListPlotsQueryDto extends createZodDto(listPlotsQuerySchema) {
  public static readonly zodSchema = listPlotsQuerySchema;
}
