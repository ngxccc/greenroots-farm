import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { UserRole, UserStatus } from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import { zFullName, zPhoneNumber } from "@/common/schemas/zod-primitives";

/**
 * Zod schema for partial staff updates (`PATCH /api/v1/admin/users/:id`).
 */
export const updateStaffSchema = z
  .object({
    fullName: zFullName().optional(),
    phone: zPhoneNumber().nullable().optional(),
    role: z.enum(UserRole).optional(),
    status: z.enum(UserStatus).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.fullName !== undefined ||
      data.phone !== undefined ||
      data.role !== undefined ||
      data.status !== undefined,
    {
      message: MESSAGES.VALIDATION.AT_LEAST_ONE_STAFF_FIELD,
    },
  );

/**
 * Validated staff update patch input.
 */
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

/**
 * Request DTO for updating a staff account's profile, role, or status (`PATCH /api/v1/admin/users/:id`).
 */
export class UpdateStaffDto extends createZodDto(updateStaffSchema) {
  public static readonly zodSchema = updateStaffSchema;
}
