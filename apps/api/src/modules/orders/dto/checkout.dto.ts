import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { PaymentMethod } from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { MAX_CART_LINE_ITEMS } from "../orders.constant";
import { cartLineItemInputSchema } from "./validate-cart.dto";

/**
 * Zod schema for `POST /api/v1/orders/checkout` requests.
 */
export const checkoutRequestSchema = z
  .object({
    items: z
      .array(cartLineItemInputSchema)
      .min(1, { message: MESSAGES.VALIDATION.MIN_VALUE })
      .max(MAX_CART_LINE_ITEMS, { message: MESSAGES.VALIDATION.MAX_VALUE }),
    addressId: zUuidV7().optional(),
    loyaltyPoints: z.number().int().nonnegative().default(0),
    clientTotalVnd: z.number().int().nonnegative().optional(),
    paymentMethod: z
      .enum([PaymentMethod.COD, PaymentMethod.PAYOS])
      .default(PaymentMethod.COD),
  })
  .strict();

/** Validated request payload for COD checkout. */
export type CheckoutRequestInput = z.infer<typeof checkoutRequestSchema>;

/**
 * Request DTO for `POST /api/v1/orders/checkout`.
 */
export class CheckoutRequestDto extends createZodDto(checkoutRequestSchema) {
  public static readonly zodSchema = checkoutRequestSchema;
}
