import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import { zDecimalQuantity, zUuidV7 } from "@/common/schemas/zod-primitives";
import { shippingQuoteSchema } from "../shipping/dto";
import {
  CART_ITEM_ISSUES,
  MAX_CART_LINE_ITEMS,
  ORDER_ITEM_MAX_QUANTITY,
  ORDER_ITEM_MIN_QUANTITY,
} from "../orders.interface";

/**
 * Reusable line-item schema for cart validation and checkout requests.
 */
export const cartLineItemInputSchema = z
  .object({
    productId: zUuidV7(),
    quantity: zDecimalQuantity({
      min: ORDER_ITEM_MIN_QUANTITY,
      max: ORDER_ITEM_MAX_QUANTITY,
    }),
  })
  .strict();

/**
 * Zod schema for `POST /api/v1/orders/validate-cart` requests.
 */
export const validateCartRequestSchema = z
  .object({
    items: z
      .array(cartLineItemInputSchema)
      .min(1, { message: MESSAGES.VALIDATION.MIN_VALUE })
      .max(MAX_CART_LINE_ITEMS, { message: MESSAGES.VALIDATION.MAX_VALUE }),
    addressId: zUuidV7().optional(),
    districtCode: z
      .string()
      .trim()
      .min(1, { message: MESSAGES.VALIDATION.REQUIRED })
      .max(50, { message: MESSAGES.VALIDATION.MAX_LENGTH })
      .optional(),
    loyaltyPoints: z.number().int().nonnegative().default(0),
    clientTotalVnd: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.addressId !== undefined && data.districtCode !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["districtCode"],
        message: MESSAGES.VALIDATION.SHIPPING_QUOTE_TARGET_XOR,
      });
    }
  });

/**
 * Zod schema for a single normalized line item inside `ValidateCartResponseDto`.
 */
export const validatedCartItemSchema = z.object({
  productId: zUuidV7(),
  name: z.string().nullable(),
  slug: z.string().nullable(),
  unit: z.string().nullable(),
  requestedQuantity: z.number().positive(),
  availableQuantity: z.number().nonnegative(),
  unitPriceVnd: z.number().int().nonnegative(),
  lineTotalVnd: z.number().int().nonnegative(),
  isAvailable: z.boolean(),
  issue: z.enum(CART_ITEM_ISSUES).nullable(),
});

/**
 * Zod schema for `POST /api/v1/orders/validate-cart` diagnostic responses.
 */
export const validateCartResponseSchema = z.object({
  isValid: z.boolean(),
  meetsMinOrderValue: z.boolean(),
  minOrderValueVnd: z.number().int().positive(),
  items: z.array(validatedCartItemSchema),
  subtotalVnd: z.number().int().nonnegative(),
  shipping: shippingQuoteSchema.nullable(),
  requestedLoyaltyPoints: z.number().int().nonnegative(),
  appliedLoyaltyPoints: z.number().int().nonnegative(),
  availableLoyaltyPoints: z.number().int().nonnegative(),
  discountAmountVnd: z.number().int().nonnegative(),
  totalAmountVnd: z.number().int().nonnegative(),
});

/** Validated request payload for cart validation. */
export type ValidateCartRequestInput = z.infer<
  typeof validateCartRequestSchema
>;

/** Diagnostic cart validation response type. */
export type ValidateCartResponse = z.infer<typeof validateCartResponseSchema>;

/** Validated cart line item projection type. */
export type ValidatedCartItem = z.infer<typeof validatedCartItemSchema>;

/**
 * Request DTO for `POST /api/v1/orders/validate-cart`.
 */
export class ValidateCartRequestDto extends createZodDto(
  validateCartRequestSchema,
) {
  public static readonly zodSchema = validateCartRequestSchema;
}

/**
 * Response DTO for `POST /api/v1/orders/validate-cart`.
 */
export class ValidateCartResponseDto extends createZodDto(
  validateCartResponseSchema,
) {
  public static readonly zodSchema = validateCartResponseSchema;
}
