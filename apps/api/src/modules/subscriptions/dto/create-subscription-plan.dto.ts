import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  zDecimalQuantity,
  zSanitizedString,
} from "@/common/schemas/zod-primitives";
import {
  MAX_SUBSCRIPTION_PLAN_DESCRIPTION_LENGTH,
  MAX_SUBSCRIPTION_PLAN_WEIGHT_KG,
  MIN_SUBSCRIPTION_PLAN_WEIGHT_KG,
  SUBSCRIPTION_PLAN_SLUG_REGEX,
} from "../subscriptions.constant";

/**
 * Validates a strict lowercase kebab-case subscription plan slug (1..255 chars).
 */
export function zSubscriptionPlanSlug() {
  return z
    .string()
    .min(1, { message: MESSAGES.VALIDATION.REQUIRED })
    .max(255, { message: MESSAGES.VALIDATION.MAX_LENGTH })
    .regex(SUBSCRIPTION_PLAN_SLUG_REGEX, {
      message: MESSAGES.VALIDATION.INVALID_SLUG,
    })
    .meta({ example: "goi-rau-gia-dinh-1-thang" });
}

/**
 * Zod schema for creating a subscription plan (`POST /api/v1/subscription-plans`).
 */
export const createSubscriptionPlanSchema = z
  .object({
    name: zSanitizedString({ min: 1, max: 255 }),
    slug: zSubscriptionPlanSlug().optional(),
    description: zSanitizedString({
      min: 1,
      max: MAX_SUBSCRIPTION_PLAN_DESCRIPTION_LENGTH,
    }),
    priceVnd: z.number().int().min(1),
    totalDeliveries: z.number().int().min(1),
    weightPerDeliveryKg: zDecimalQuantity({
      min: MIN_SUBSCRIPTION_PLAN_WEIGHT_KG,
      max: MAX_SUBSCRIPTION_PLAN_WEIGHT_KG,
    }),
    basketDescription: zSanitizedString({
      min: 1,
      max: MAX_SUBSCRIPTION_PLAN_DESCRIPTION_LENGTH,
    }),
    isActive: z.boolean().optional(),
  })
  .strict();

/**
 * Validated payload for creating a subscription plan.
 */
export type CreateSubscriptionPlanInput = z.infer<
  typeof createSubscriptionPlanSchema
>;

/**
 * Request body DTO for `POST /api/v1/subscription-plans`.
 */
export class CreateSubscriptionPlanDto extends createZodDto(
  createSubscriptionPlanSchema,
) {
  public static readonly zodSchema = createSubscriptionPlanSchema;
}
