import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { UserRole } from "@greenroots/shared";
import {
  zEmail,
  zFullName,
  zPhoneNumber,
} from "@/common/schemas/zod-primitives";

/**
 * Zod schema for inviting/creating a staff account (`POST /api/v1/admin/users`).
 */
export const createStaffSchema = z
  .object({
    email: zEmail(),
    fullName: zFullName(),
    phone: zPhoneNumber().nullable().optional(),
    role: z.enum(UserRole),
  })
  .strict();

/**
 * Validated staff creation input.
 */
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

/**
 * Request DTO for inviting/creating a staff account (`POST /api/v1/admin/users`).
 */
export class CreateStaffDto extends createZodDto(createStaffSchema) {
  public static readonly zodSchema = createStaffSchema;
}
