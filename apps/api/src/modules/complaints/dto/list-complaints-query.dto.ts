import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { ComplaintResolution, ComplaintStatus } from "@greenroots/shared";
import {
  zNumericString,
  zSanitizedString,
  zUuidV7,
} from "@/common/schemas/zod-primitives";
import {
  COMPLAINT_SEARCH_MAX_LENGTH,
  COMPLAINT_SEARCH_MIN_LENGTH,
} from "../complaints.constant";

/**
 * Zod schema for paginated staff complaint list queries (`GET /api/v1/complaints`).
 */
export const listComplaintsQuerySchema = z
  .object({
    page: zNumericString({ integer: true, min: 1 }).default(1),
    limit: zNumericString({ integer: true, min: 1, max: 100 }).default(20),
    status: z.enum(ComplaintStatus).optional(),
    resolution: z.enum(ComplaintResolution).optional(),
    orderId: zUuidV7().optional(),
    customerId: zUuidV7().optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    search: zSanitizedString({
      min: COMPLAINT_SEARCH_MIN_LENGTH,
      max: COMPLAINT_SEARCH_MAX_LENGTH,
    }).optional(),
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

/** Validated query parameters for staff complaint listing. */
export type ListComplaintsQuery = z.infer<typeof listComplaintsQuerySchema>;

/**
 * Query parameters DTO for `GET /api/v1/complaints`.
 */
export class ListComplaintsQueryDto extends createZodDto(
  listComplaintsQuerySchema,
) {
  public static readonly zodSchema = listComplaintsQuerySchema;
}
