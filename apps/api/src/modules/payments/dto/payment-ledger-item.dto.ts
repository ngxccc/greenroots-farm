import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import {
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
} from "@greenroots/shared";
import { zUuidV7 } from "@/common/schemas/zod-primitives";

/**
 * Zod schema for a sanitized, hydrated staff payment ledger item (`ADR-0043`).
 * Excludes `rawPayload` and `paymentUrl`.
 */
export const paymentLedgerItemSchema = z.object({
  id: zUuidV7(),
  orderId: zUuidV7().nullable(),
  orderCode: z.string().nullable(),
  subscriptionId: zUuidV7().nullable(),
  subscriptionCode: z.string().nullable(),
  amountVnd: z.number().int().nonnegative(),
  paymentMethod: z.enum(PaymentMethod),
  status: z.enum(PaymentStatus),
  transactionType: z.enum(PaymentTransactionType),
  payosOrderCode: z.number().int().nullable(),
  referenceCode: z.string().nullable(),
  verifiedBy: zUuidV7().nullable(),
  verifiedByName: z.string().nullable(),
  paidAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** Sanitized staff payment ledger projection type. */
export type PaymentLedgerItemProjection = z.infer<
  typeof paymentLedgerItemSchema
>;

/**
 * Response DTO for a sanitized staff payment ledger entry.
 */
export class PaymentLedgerItemDto extends createZodDto(
  paymentLedgerItemSchema,
) {
  public static readonly zodSchema = paymentLedgerItemSchema;
}
