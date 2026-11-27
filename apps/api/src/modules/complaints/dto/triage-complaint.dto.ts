import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { ComplaintStatus } from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import { zSanitizedString } from "@/common/schemas/zod-primitives";
import {
  TRIAGE_NOTE_MAX_LENGTH,
  TRIAGE_NOTE_MIN_LENGTH,
  TRIAGE_TARGET_STATUSES,
} from "../complaints.constant";

/**
 * Zod schema for staff complaint triage (`PATCH /api/v1/complaints/:id/triage`).
 * Enforces `triaged | rejected` target statuses and a mandatory 5-500 char note on `rejected`.
 */
export const triageComplaintSchema = z
  .object({
    status: z
      .enum(TRIAGE_TARGET_STATUSES)
      .describe("Target triage status (triaged or rejected)"),
    triageNote: zSanitizedString({ max: TRIAGE_NOTE_MAX_LENGTH })
      .nullable()
      .optional()
      .describe(
        "Mandatory rationale (5-500 chars) when rejecting; optional (<= 500 chars) when triaging",
      ),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.status === ComplaintStatus.REJECTED) {
      const note = data.triageNote ?? "";
      if (note.length < TRIAGE_NOTE_MIN_LENGTH) {
        ctx.addIssue({
          code: "custom",
          path: ["triageNote"],
          message:
            note.length === 0
              ? MESSAGES.VALIDATION.REQUIRED
              : MESSAGES.VALIDATION.MIN_LENGTH,
        });
      }
    }
  });

/** Validated staff triage payload consumed by `ComplaintsService`. */
export type TriageComplaintInput = z.infer<typeof triageComplaintSchema>;

/**
 * Request body DTO for `PATCH /api/v1/complaints/:id/triage`.
 */
export class TriageComplaintDto extends createZodDto(triageComplaintSchema) {
  public static readonly zodSchema = triageComplaintSchema;
}
