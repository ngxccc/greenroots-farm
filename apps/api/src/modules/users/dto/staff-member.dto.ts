import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { UserRole, UserStatus } from "@greenroots/shared";
import { zUuidV7 } from "@/common/schemas/zod-primitives";

/**
 * Zod schema for the closed staff projection returned by `/api/v1/admin/users`.
 */
export const staffMemberSchema = z.object({
  id: zUuidV7(),
  email: z.string(),
  fullName: z.string().min(1).max(100),
  phone: z.string().nullable(),
  role: z.enum(UserRole),
  status: z.enum(UserStatus),
  emailVerified: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/**
 * Closed staff projection type excluding credentials, tokens, and loyalty points.
 */
export type StaffMember = z.infer<typeof staffMemberSchema>;

/**
 * Closed staff projection DTO exposed by `/api/v1/admin/users` endpoints.
 */
export class StaffMemberDto extends createZodDto(staffMemberSchema) {
  public static readonly zodSchema = staffMemberSchema;
}
