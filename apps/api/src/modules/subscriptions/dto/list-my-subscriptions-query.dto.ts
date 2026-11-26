import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { SubscriptionStatus } from "@greenroots/shared";
import { zNumericString } from "@/common/schemas/zod-primitives";

/**
 * Zod schema for paginated customer subscription history (`GET /api/v1/subscriptions/me`).
 */
export const listMySubscriptionsQuerySchema = z
  .object({
    status: z.enum(SubscriptionStatus).optional(),
    page: zNumericString({ integer: true, min: 1 }).default(1),
    limit: zNumericString({ integer: true, min: 1, max: 100 }).default(20),
  })
  .strict();

/** Validated query parameters for customer subscription history. */
export type ListMySubscriptionsQuery = z.infer<
  typeof listMySubscriptionsQuerySchema
>;

/**
 * Query parameters DTO for `GET /api/v1/subscriptions/me`.
 */
export class ListMySubscriptionsQueryDto extends createZodDto(
  listMySubscriptionsQuerySchema,
) {
  public static readonly zodSchema = listMySubscriptionsQuerySchema;
}
