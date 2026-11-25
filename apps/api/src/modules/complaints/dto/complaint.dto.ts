import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { ComplaintResolution, ComplaintStatus } from "@greenroots/shared";
import { zUuidV7 } from "@/common/schemas/zod-primitives";

/**
 * Zod schema for the customer-facing complaint projection (omits internal `resolvedBy`).
 */
export const complaintSchema = z.object({
  id: zUuidV7(),
  orderId: zUuidV7(),
  customerId: zUuidV7(),
  reason: z.string(),
  proofImageUrls: z.array(z.string()),
  proofVideoUrl: z.string().nullable(),
  status: z.enum(ComplaintStatus),
  resolution: z.enum(ComplaintResolution).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** Closed customer complaint projection type. */
export type ComplaintProjection = z.infer<typeof complaintSchema>;

/**
 * Response DTO for a submitted or retrieved customer complaint.
 */
export class ComplaintDto extends createZodDto(complaintSchema) {
  public static readonly zodSchema = complaintSchema;
}
