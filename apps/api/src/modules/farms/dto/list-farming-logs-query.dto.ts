import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { FarmingActionType } from "@greenroots/shared";
import { zNumericString } from "@/common/schemas/zod-primitives";
import { FARMING_LOG_SORT_OPTIONS } from "../farms.interface";

/**
 * Zod schema for paginated farming log listing query parameters (`GET /api/v1/seasons/:id/logs`).
 */
export const listFarmingLogsQuerySchema = z
  .object({
    actionType: z.enum(FarmingActionType).optional(),
    page: zNumericString({ integer: true, min: 1 }).default(1),
    limit: zNumericString({ integer: true, min: 1, max: 100 }).default(20),
    sort: z.enum(FARMING_LOG_SORT_OPTIONS).default("loggedAt:desc"),
  })
  .strict();

/**
 * Validated query parameters for listing farming logs of a season.
 */
export type ListFarmingLogsQuery = z.infer<typeof listFarmingLogsQuerySchema>;

/**
 * Query parameters DTO for `GET /api/v1/seasons/:id/logs`.
 */
export class ListFarmingLogsQueryDto extends createZodDto(
  listFarmingLogsQuerySchema,
) {
  public static readonly zodSchema = listFarmingLogsQuerySchema;
}
