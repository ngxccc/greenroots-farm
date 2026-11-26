import { BUSINESS_RULES } from "@greenroots/shared";
import { z } from "zod";
import type { components } from "@/types/api-schema";

export type ValidateCartRequest =
  components["schemas"]["ValidateCartRequestDto"];
export type ValidateCartResponse =
  components["schemas"]["ValidateCartResponseDto"];
export type ValidateCartItem = ValidateCartResponse["items"][number];
export type CheckoutRequest = components["schemas"]["CheckoutRequestDto"];
export type OrderDto = components["schemas"]["OrderDto"];

export const MAX_CART_LINE_ITEMS = 50;

/**
 * Validates a single normalized cart line item against backend quantity bounds (`0.01..`, max 2 decimals).
 */
export const cartLineItemInputSchema = z
  .object({
    productId: z.uuid("Mã sản phẩm không hợp lệ."),
    quantity: z
      .number()
      .min(
        BUSINESS_RULES.ORDER_ITEM_MIN_QUANTITY,
        "Số lượng sản phẩm phải lớn hơn 0.",
      )
      .refine(
        (val) => Math.abs(val * 100 - Math.round(val * 100)) < 1e-9,
        "Số lượng tối đa 2 chữ số thập phân.",
      ),
  })
  .strict();

/**
 * Strict schema mirroring `ValidateCartRequestDto` (`POST /api/v1/orders/validate-cart`).
 */
export const validateCartInputSchema = z
  .object({
    items: z
      .array(cartLineItemInputSchema)
      .min(1, "Giỏ hàng không được để trống.")
      .max(
        MAX_CART_LINE_ITEMS,
        `Tối đa ${MAX_CART_LINE_ITEMS} sản phẩm mỗi đơn.`,
      ),
    addressId: z.uuid("Mã địa chỉ không hợp lệ.").optional(),
    placeId: z.string().min(1).max(255).optional(),
    loyaltyPoints: z.number().int().nonnegative().default(0),
    clientTotalVnd: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    (data) => !(data.addressId !== undefined && data.placeId !== undefined),
    "Không thể truyền đồng thời mã địa chỉ và mã địa điểm.",
  );

/**
 * Strict schema mirroring `CheckoutRequestDto` plus required UUID `Idempotency-Key` header.
 */
export const checkoutInputSchema = z
  .object({
    idempotencyKey: z.uuid("Idempotency-Key phải là UUID hợp lệ."),
    items: z
      .array(cartLineItemInputSchema)
      .min(1, "Giỏ hàng không được để trống.")
      .max(
        MAX_CART_LINE_ITEMS,
        `Tối đa ${MAX_CART_LINE_ITEMS} sản phẩm mỗi đơn.`,
      ),
    addressId: z.uuid("Mã địa chỉ không hợp lệ.").optional(),
    loyaltyPoints: z.number().int().nonnegative().default(0),
    clientTotalVnd: z.number().int().nonnegative().optional(),
  })
  .strict();

export type ValidateCartInput = z.input<typeof validateCartInputSchema>;
export type CheckoutInput = z.input<typeof checkoutInputSchema>;
