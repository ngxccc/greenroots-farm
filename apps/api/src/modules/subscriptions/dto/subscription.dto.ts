import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { DeliveryDay, SubscriptionStatus } from "@greenroots/shared";
import { zUuidV7 } from "@/common/schemas/zod-primitives";

/**
 * Closed customer subscription projection schema (`ADR-0041`).
 * Omits internal payment fields (`rawPayload`, `referenceCode`, `verifiedBy`).
 */
export const subscriptionSchema = z.object({
  id: zUuidV7(),
  subscriptionCode: z.string(),
  planId: zUuidV7().nullable(),
  planName: z.string(),
  priceVnd: z.number().int().nonnegative(),
  totalDeliveries: z.number().int().positive(),
  weightPerDeliveryKg: z.number().positive(),
  basketDescription: z.string(),
  deliveryDay: z.enum(DeliveryDay),
  remainingDeliveries: z.number().int().nonnegative(),
  status: z.enum(SubscriptionStatus),
  receiverName: z.string(),
  receiverPhone: z.string(),
  shippingAddress: z.string(),
  shippingDistanceKm: z.number().nonnegative(),
  shippingFeePerDeliveryVnd: z.number().int().nonnegative(),
  totalAmountVnd: z.number().int().nonnegative(),
  startDate: z.string(),
  endDate: z.string(),
  paymentUrl: z.string().nullable(),
  reservationExpiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/**
 * Closed customer subscription projection type (`ADR-0041`).
 */
export type SubscriptionProjection = z.infer<typeof subscriptionSchema>;

/**
 * Response DTO for a customer subscription.
 */
export class SubscriptionDto extends createZodDto(subscriptionSchema) {
  public static readonly zodSchema = subscriptionSchema;
}
