import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import {
  ComplaintRefundChannel,
  ComplaintResolution,
  ComplaintStatus,
  PaymentMethod,
} from "@greenroots/shared";
import { zUuidV7 } from "@/common/schemas/zod-primitives";

/**
 * Zod schema for the staff-facing complaint projection (`ADR-0045`).
 * Hydrated with order and customer context plus internal triage/resolution attribution.
 */
export const staffComplaintSchema = z.object({
  id: zUuidV7(),
  orderId: zUuidV7(),
  orderCode: z.string(),
  orderTotalVnd: z.number().int().nonnegative(),
  orderPaymentMethod: z.enum(PaymentMethod),
  orderDeliveredAt: z.iso.datetime().nullable(),
  customerId: zUuidV7(),
  customerName: z.string(),
  customerPhone: z.string().nullable(),
  reason: z.string(),
  proofImageUrls: z.array(z.string()),
  proofVideoUrl: z.string().nullable(),
  status: z.enum(ComplaintStatus),
  resolution: z.enum(ComplaintResolution).nullable(),
  triagedBy: zUuidV7().nullable(),
  triagedAt: z.iso.datetime().nullable(),
  triageNote: z.string().nullable(),
  resolvedBy: zUuidV7().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
  resolutionNote: z.string().nullable(),
  refundChannel: z.enum(ComplaintRefundChannel).nullable(),
  refundAmountVnd: z.number().int().positive().nullable(),
  replacementOrderId: zUuidV7().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** Hydrated staff complaint projection type. */
export type StaffComplaintProjection = z.infer<typeof staffComplaintSchema>;

/**
 * Response DTO for staff complaint listing and triage endpoints.
 */
export class StaffComplaintDto extends createZodDto(staffComplaintSchema) {
  public static readonly zodSchema = staffComplaintSchema;
}
