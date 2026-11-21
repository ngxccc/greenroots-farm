import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import { zUuidV7 } from "@/common/schemas/zod-primitives";

/**
 * Zod schema for `POST /api/v1/shipping/quote` enforcing a strict XOR between
 * a saved `addressId` and an HCMC `districtCode`.
 */
export const shippingQuoteRequestSchema = z
  .object({
    addressId: zUuidV7().optional(),
    districtCode: z
      .string()
      .trim()
      .min(1, { message: MESSAGES.VALIDATION.REQUIRED })
      .max(50, { message: MESSAGES.VALIDATION.MAX_LENGTH })
      .optional(),
    isSubscription: z.boolean().default(false),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasAddressId = data.addressId !== undefined;
    const hasDistrictCode = data.districtCode !== undefined;

    if (hasAddressId === hasDistrictCode) {
      ctx.addIssue({
        code: "custom",
        path: [hasAddressId ? "districtCode" : "addressId"],
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
