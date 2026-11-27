import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { OrderStatus } from "@greenroots/shared";
import { zNumericString } from "@/common/schemas/zod-primitives";
import { ORDER_SORT_OPTIONS } from "../orders.constant";

/**
 * Zod schema for paginated backoffice staff order fulfillment queue (`GET /api/v1/orders`).
 */
export const listStaffOrdersQuerySchema = z
  .object({
    status: z.enum(OrderStatus).optional(),
    statuses: z
      .union([
        z
          .string()
          .trim()
          .min(1)
          .transform((value) =>
            Array.from(
              new Set(
                value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
              ),
            ),
          ),
        z.array(z.enum(OrderStatus)),
      ])
      .pipe(
        z
          .array(z.enum(OrderStatus))
          .min(1)
          .max(Object.values(OrderStatus).length),
      )
      .optional(),
    isSubscription: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    search: z.string().trim().min(1).max(100).optional(),
    page: zNumericString({ integer: true, min: 1 }).default(1),
    limit: zNumericString({ integer: true, min: 1, max: 100 }).default(20),
    sort: z.enum(ORDER_SORT_OPTIONS).default("createdAt:desc"),
  })
  .strict()
  .refine(
    (data) => !(data.status !== undefined && data.statuses !== undefined),
    {
      message: "Cannot specify both status and statuses query parameters.",
      path: ["statuses"],
    },
  );

/** Validated query parameters for backoffice staff order listing. */
export type ListStaffOrdersQuery = z.infer<typeof listStaffOrdersQuerySchema>;

/**
 * Query parameters DTO for `GET /api/v1/orders`.
 */
export class ListStaffOrdersQueryDto extends createZodDto(
  listStaffOrdersQuerySchema,
) {
  public static readonly zodSchema = listStaffOrdersQuerySchema;
}
