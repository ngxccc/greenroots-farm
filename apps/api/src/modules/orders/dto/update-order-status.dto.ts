import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { OrderStatus } from "@greenroots/shared";

/**
 * Zod schema for `PATCH /api/v1/orders/:id/status` requests.
 */
export const updateOrderStatusRequestSchema = z
  .object({
    status: z.enum(OrderStatus),
  })
  .strict();

/** Validated request payload for staff order status transitions. */
export type UpdateOrderStatusRequestInput = z.infer<
  typeof updateOrderStatusRequestSchema
>;

/**
 * Request DTO for `PATCH /api/v1/orders/:id/status`.
 */
export class UpdateOrderStatusRequestDto extends createZodDto(
  updateOrderStatusRequestSchema,
) {
  public static readonly zodSchema = updateOrderStatusRequestSchema;
}
