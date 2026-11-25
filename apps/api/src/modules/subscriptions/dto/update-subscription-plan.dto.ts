import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import { createSubscriptionPlanSchema } from "./create-subscription-plan.dto";

/**
 * Zod schema for partially updating or soft-retiring a subscription plan (`PATCH /api/v1/subscription-plans/:id`).
 */
export const updateSubscriptionPlanSchema = createSubscriptionPlanSchema
  .partial()
  .strict()
  .refine(
    (data) =>
      Object.values(data as Record<string, unknown>).some(
        (value) => value !== undefined,
      ),
    {
      message: MESSAGES.VALIDATION.AT_LEAST_ONE_SUBSCRIPTION_PLAN_FIELD,
    },
  );

/**
 * Validated partial update payload for `PATCH /api/v1/subscription-plans/:id`.
 */
export type UpdateSubscriptionPlanInput = z.infer<
  typeof updateSubscriptionPlanSchema
>;

/**
 * Request body DTO for `PATCH /api/v1/subscription-plans/:id`.
 */
export class UpdateSubscriptionPlanDto extends createZodDto(
  updateSubscriptionPlanSchema,
) {
  public static readonly zodSchema = updateSubscriptionPlanSchema;
}
