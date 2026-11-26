import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import {
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
} from "@greenroots/shared";
import {
  zNumericString,
  zSanitizedString,
  zUuidV7,
} from "@/common/schemas/zod-primitives";

/**
 * Zod schema for paginated staff payment ledger queries (`GET /api/v1/payments`).
 */
export const listPaymentsQuerySchema = z
  .object({
    page: zNumericString({ integer: true, min: 1 }).default(1),
    limit: zNumericString({ integer: true, min: 1, max: 100 }).default(20),
    status: z.enum(PaymentStatus).optional(),
    paymentMethod: z.enum(PaymentMethod).optional(),
    transactionType: z.enum(PaymentTransactionType).optional(),
    orderId: zUuidV7().optional(),
    subscriptionId: zUuidV7().optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    search: zSanitizedString({ min: 1, max: 100 }).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.from === undefined ||
      data.to === undefined ||
      new Date(data.from).getTime() <= new Date(data.to).getTime(),
    {
      message: "from must be less than or equal to to.",
      path: ["to"],
    },
  );

/** Validated query parameters for staff payment ledger listing. */
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;

/**
 * Query parameters DTO for `GET /api/v1/payments`.
 */
export class ListPaymentsQueryDto extends createZodDto(
  listPaymentsQuerySchema,
) {
  public static readonly zodSchema = listPaymentsQuerySchema;
}
