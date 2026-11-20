import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { BatchStatus } from "@greenroots/shared";
import {
  zNumericString,
  zSanitizedString,
  zUuidV7,
} from "@/common/schemas/zod-primitives";
import { BATCH_SORT_OPTIONS } from "../inventory.interface";

/**
 * Zod schema for paginated inventory batch listing (`GET /api/v1/batches`).
 */
export const listBatchesQuerySchema = z
  .object({
    productId: zUuidV7().optional(),
    seasonId: zUuidV7().optional(),
    status: z.enum(BatchStatus).optional(),
    search: zSanitizedString({ min: 1, max: 100 }).optional(),
    page: zNumericString({ integer: true, min: 1 }).default(1),
    limit: zNumericString({ integer: true, min: 1, max: 100 }).default(20),
    sort: z.enum(BATCH_SORT_OPTIONS).default("createdAt:desc"),
  })
  .strict();

/** Validated batch listing query parameters. */
export type ListBatchesQuery = z.infer<typeof listBatchesQuerySchema>;

/**
 * Query parameters DTO for `GET /api/v1/batches`.
 */
export class ListBatchesQueryDto extends createZodDto(listBatchesQuerySchema) {
  public static readonly zodSchema = listBatchesQuerySchema;
}
