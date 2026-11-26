import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { DeliveryDay } from "@greenroots/shared";
import { zUuidV7 } from "@/common/schemas/zod-primitives";

/**
 * Zod schema for initiating a prepaid subscription checkout (`POST /api/v1/subscriptions`).
 */
export const createSubscriptionCheckoutSchema = z
  .object({
    planId: zUuidV7(),
    addressId: zUuidV7().optional(),
    deliveryDay: z.enum(DeliveryDay),
  })
  .strict();

/** Validated payload for initiating a prepaid subscription checkout. */
export type CreateSubscriptionCheckoutInput = z.infer<
  typeof createSubscriptionCheckoutSchema
>;

/**
 * Request DTO for `POST /api/v1/subscriptions`.
 */
export class CreateSubscriptionCheckoutDto extends createZodDto(
  createSubscriptionCheckoutSchema,
) {
  public static readonly zodSchema = createSubscriptionCheckoutSchema;
}
