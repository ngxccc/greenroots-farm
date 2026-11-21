import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { OrderStatus } from "@greenroots/shared";
import { zNumericString } from "@/common/schemas/zod-primitives";
import { ORDER_SORT_OPTIONS } from "../orders.interface";

/**
 * Zod schema for paginated customer order history (`GET /api/v1/orders/me`).
 */
export const listMyOrdersQuerySchema = z
  .object({
    status: z.enum(OrderStatus).optional(),
    page: zNumericString({ integer: true, min: 1 }).default(1),
    limit: zNumericString({ integer: true, min: 1, max: 100 }).default(20),
    sort: z.enum(ORDER_SORT_OPTIONS).default("createdAt:desc"),
  })
  .strict();

/** Validated query parameters for customer order history. */
export type ListMyOrdersQuery = z.infer<typeof listMyOrdersQuerySchema>;

/**
 * Query parameters DTO for `GET /api/v1/orders/me`.
 */
export class ListMyOrdersQueryDto extends createZodDto(
  listMyOrdersQuerySchema,
) {
  public static readonly zodSchema = listMyOrdersQuerySchema;
}
