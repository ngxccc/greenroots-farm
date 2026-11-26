import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import { zUuidV7 } from "@/common/schemas/zod-primitives";

/**
 * Zod schema for `POST /api/v1/shipping/quote` enforcing a strict XOR between
 * a saved `addressId` and a Goong/mock `placeId`.
 */
export const shippingQuoteRequestSchema = z
  .object({
    addressId: zUuidV7().optional(),
    placeId: z
      .string()
      .trim()
      .min(1, { message: MESSAGES.VALIDATION.REQUIRED })
      .max(255, { message: MESSAGES.VALIDATION.MAX_LENGTH })
      .optional(),
    isSubscription: z.boolean().default(false),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasAddressId = data.addressId !== undefined;
    const hasPlaceId = data.placeId !== undefined;

    if (hasAddressId === hasPlaceId) {
      ctx.addIssue({
        code: "custom",
        path: [hasAddressId ? "placeId" : "addressId"],
        message: MESSAGES.VALIDATION.SHIPPING_QUOTE_TARGET_XOR,
      });
    }
  });

/**
 * Validated request payload for `POST /api/v1/shipping/quote`.
 */
export type ShippingQuoteRequestInput = z.infer<
  typeof shippingQuoteRequestSchema
>;

/**
 * Request body DTO for `POST /api/v1/shipping/quote`.
 */
export class ShippingQuoteRequestDto extends createZodDto(
  shippingQuoteRequestSchema,
) {
  public static readonly zodSchema = shippingQuoteRequestSchema;
}
