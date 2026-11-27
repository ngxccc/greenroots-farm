import { DeliveryDay } from "@greenroots/shared";
import { z } from "zod";
import type { components } from "@/types/api-schema";

/**
 * Generated subscription DTO from OpenAPI schema (`ADR-0007`).
 */
export type SubscriptionDto = components["schemas"]["SubscriptionDto"];

/**
 * Request body accepted by `POST /api/v1/subscriptions`.
 */
export type CreateSubscriptionCheckoutDto =
  components["schemas"]["CreateSubscriptionCheckoutDto"];

/**
 * Zod validation schema for Storefront subscription checkout Server Action input.
 */
export const createSubscriptionCheckoutInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    planId: z.uuid(),
    addressId: z.uuid().optional(),
    deliveryDay: z.enum([
      DeliveryDay.TUESDAY,
      DeliveryDay.FRIDAY,
      DeliveryDay.BOTH,
    ]),
  })
  .strict();

/**
 * Input accepted by `createSubscriptionCheckoutAction`.
 */
export type CreateSubscriptionCheckoutInput = z.infer<
  typeof createSubscriptionCheckoutInputSchema
>;

/**
 * Strict schema for the non-production mock PayOS subscription webhook bridge action.
 */
export const mockConfirmSubscriptionPayosInputSchema = z
  .object({
    subscriptionId: z.uuid("Mã gói đăng ký không hợp lệ."),
    paymentUrl: z.url("Liên kết thanh toán không hợp lệ."),
    amountVnd: z.number().int().positive("Số tiền thanh toán phải lớn hơn 0."),
    subscriptionCode: z.string().min(1, "Mã gói đăng ký không được để trống."),
  })
  .strict();

export type MockConfirmSubscriptionPayosInput = z.input<
  typeof mockConfirmSubscriptionPayosInputSchema
>;
