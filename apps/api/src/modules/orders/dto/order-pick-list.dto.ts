import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { BatchStatus } from "@greenroots/shared";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { PICK_LIST_ALLOWED_STATUSES } from "../orders.constant";

/**
 * Zod schema for a single batch-grouped pick-list entry (`#87`).
 */
export const pickListBatchItemSchema = z.object({
  batchId: zUuidV7(),
  batchCode: z.string(),
  expirationDate: z.iso.datetime(),
  batchStatus: z.enum(BatchStatus),
  isExpired: z.boolean(),
  productId: zUuidV7(),
  productName: z.string(),
  unit: z.string(),
  allocatedQuantity: z.number().positive(),
});

/**
 * Zod schema for the closed warehouse pick-list projection (`GET /api/v1/orders/:id/pick-list`).
 */
export const orderPickListSchema = z.object({
  orderId: zUuidV7(),
  orderCode: z.string(),
  orderStatus: z.enum(PICK_LIST_ALLOWED_STATUSES),
  generatedAt: z.iso.datetime(),
  batches: z.array(pickListBatchItemSchema).min(1),
});

/** Batch-grouped pick-list item projection type. */
export type PickListBatchItemProjection = z.infer<
  typeof pickListBatchItemSchema
>;

/** Closed order pick-list projection type. */
export type OrderPickListProjection = z.infer<typeof orderPickListSchema>;

/**
 * Response DTO for a single batch-grouped entry in an order pick list.
 */
export class PickListBatchItemDto extends createZodDto(
  pickListBatchItemSchema,
) {
  public static readonly zodSchema = pickListBatchItemSchema;
}

/**
 * Response DTO for `GET /api/v1/orders/:id/pick-list`.
 */
export class OrderPickListDto extends createZodDto(orderPickListSchema) {
  public static readonly zodSchema = orderPickListSchema;
}
