import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { zNumericString } from "@/common/schemas/zod-primitives";

/**
 * Zod schema for paginated near-expiry inventory listing (`GET /api/v1/inventory/near-expiry`).
 */
export const listNearExpiryQuerySchema = z
  .object({
    page: zNumericString({ integer: true, min: 1 }).default(1),
    limit: zNumericString({ integer: true, min: 1, max: 100 }).default(20),
  })
  .strict();

/** Validated near-expiry inventory listing query parameters. */
export type ListNearExpiryQuery = z.infer<typeof listNearExpiryQuerySchema>;

/**
 * Query parameters DTO for `GET /api/v1/inventory/near-expiry`.
 */
export class ListNearExpiryQueryDto extends createZodDto(
  listNearExpiryQuerySchema,
) {
  public static readonly zodSchema = listNearExpiryQuerySchema;
}
