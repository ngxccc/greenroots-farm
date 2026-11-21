import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { WasteLogStatus } from "@greenroots/shared";
import {
  zNumericString,
  zSanitizedString,
  zUuidV7,
} from "@/common/schemas/zod-primitives";
import { WASTE_LOG_SORT_OPTIONS } from "../inventory.constant";

/**
 * Zod schema for paginated waste log listing (`GET /api/v1/waste-logs`).
 */
export const listWasteLogsQuerySchema = z
  .object({
    status: z.enum(WasteLogStatus).optional(),
    batchId: zUuidV7().optional(),
    productId: zUuidV7().optional(),
    search: zSanitizedString({ min: 1, max: 100 }).optional(),
    page: zNumericString({ integer: true, min: 1 }).default(1),
    limit: zNumericString({ integer: true, min: 1, max: 100 }).default(20),
    sort: z.enum(WASTE_LOG_SORT_OPTIONS).default("createdAt:desc"),
  })
  .strict();

/** Validated waste log listing query parameters. */
export type ListWasteLogsQuery = z.infer<typeof listWasteLogsQuerySchema>;

/**
 * Query parameters DTO for `GET /api/v1/waste-logs`.
 */
export class ListWasteLogsQueryDto extends createZodDto(
  listWasteLogsQuerySchema,
) {
  public static readonly zodSchema = listWasteLogsQuerySchema;
}
