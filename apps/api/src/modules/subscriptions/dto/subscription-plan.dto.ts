import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { zUuidV7 } from "@/common/schemas/zod-primitives";

/**
 * Closed subscription plan projection schema excluding `deletedAt`.
 */
export const subscriptionPlanSchema = z.object({
  id: zUuidV7(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  priceVnd: z.number().int(),
  totalDeliveries: z.number().int(),
  weightPerDeliveryKg: z.number().positive(),
  basketDescription: z.string(),
  isActive: z.boolean(),
  activeSubscriberCount: z.number().int().nonnegative().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/**
 * Closed subscription plan projection type excluding `deletedAt`.
 */
export type SubscriptionPlanProjection = z.infer<typeof subscriptionPlanSchema>;

/**
 * Response DTO for a subscription plan.
 */
export class SubscriptionPlanDto extends createZodDto(subscriptionPlanSchema) {
  public static readonly zodSchema = subscriptionPlanSchema;
}
