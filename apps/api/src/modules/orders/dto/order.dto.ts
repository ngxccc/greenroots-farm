import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { OrderStatus, PaymentMethod, PaymentStatus } from "@greenroots/shared";
import { zUuidV7 } from "@/common/schemas/zod-primitives";

/**
 * Zod schema for a single closed order line item projection.
 */
export const orderItemSchema = z.object({
  id: zUuidV7(),
  productId: zUuidV7(),
  productName: z.string(),
  productSlug: z.string(),
  unit: z.string(),
  quantity: z.number().positive(),
  unitPriceVnd: z.number().int().nonnegative(),
  lineTotalVnd: z.number().int().nonnegative(),
});

/**
 * Zod schema for the closed customer order projection returned by checkout and order reads.
 */
export const orderSchema = z.object({
  id: zUuidV7(),
  orderCode: z.string(),
  orderStatus: z.enum(OrderStatus),
  paymentMethod: z.enum(PaymentMethod),
  paymentStatus: z.enum(PaymentStatus),
  receiverName: z.string(),
  receiverPhone: z.string(),
  shippingAddress: z.string(),
  shippingDistanceKm: z.number().nonnegative(),
  shippingFeeVnd: z.number().int().nonnegative(),
  subtotalVnd: z.number().int().nonnegative(),
  discountAmountVnd: z.number().int().nonnegative(),
  loyaltyPointsUsed: z.number().int().nonnegative(),
  totalAmountVnd: z.number().int().nonnegative(),
  items: z.array(orderItemSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** Closed order line item projection type. */
export type OrderItemProjection = z.infer<typeof orderItemSchema>;

/** Closed order projection type. */
export type OrderProjection = z.infer<typeof orderSchema>;

/**
 * Response DTO for an order line item.
 */
export class OrderItemDto extends createZodDto(orderItemSchema) {
  public static readonly zodSchema = orderItemSchema;
}

/**
 * Response DTO for a created or retrieved customer order.
 */
export class OrderDto extends createZodDto(orderSchema) {
  public static readonly zodSchema = orderSchema;
}
