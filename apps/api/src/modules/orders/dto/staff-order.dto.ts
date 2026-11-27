import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { orderItemSchema, orderSchema } from "./order.dto";

/**
 * Zod schema for a batch allocation attached to an order line item in staff fulfillment responses.
 */
export const batchAllocationSummarySchema = z.object({
  id: zUuidV7(),
  batchId: zUuidV7(),
  batchCode: z.string(),
  expirationDate: z.iso.datetime(),
  allocatedQuantity: z.number().positive(),
  releasedAt: z.iso.datetime().nullable(),
});

/**
 * Zod schema for a staff-facing order line item including FEFO batch allocations.
 */
export const staffOrderItemSchema = orderItemSchema.extend({
  allocations: z.array(batchAllocationSummarySchema),
});

/**
 * Zod schema for staff order projections returned by confirmation and status transition endpoints (`ADR-0033`).
 */
export const staffOrderSchema = orderSchema.extend({
  customerId: zUuidV7(),
  subscriptionId: zUuidV7().nullable(),
  items: z.array(staffOrderItemSchema),
});

/** Batch allocation summary projection type. */
export type BatchAllocationSummaryProjection = z.infer<
  typeof batchAllocationSummarySchema
>;

/** Staff-facing order line item projection type. */
export type StaffOrderItemProjection = z.infer<typeof staffOrderItemSchema>;

/** Staff-facing order projection type. */
export type StaffOrderProjection = z.infer<typeof staffOrderSchema>;

/**
 * Response DTO for a single FEFO batch allocation on a staff order item.
 */
export class BatchAllocationSummaryDto extends createZodDto(
  batchAllocationSummarySchema,
) {
  public static readonly zodSchema = batchAllocationSummarySchema;
}

/**
 * Response DTO for a staff order line item with batch allocations.
 */
export class StaffOrderItemDto extends createZodDto(staffOrderItemSchema) {
  public static readonly zodSchema = staffOrderItemSchema;
}

/**
 * Response DTO for staff order confirmation and status transition responses.
 */
export class StaffOrderDto extends createZodDto(staffOrderSchema) {
  public static readonly zodSchema = staffOrderSchema;
}
