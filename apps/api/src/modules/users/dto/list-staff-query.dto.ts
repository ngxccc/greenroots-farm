import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { UserRole, UserStatus } from "@greenroots/shared";
import {
  zNumericString,
  zSanitizedString,
} from "@/common/schemas/zod-primitives";
import { STAFF_SORT_OPTIONS } from "../users.constant";

/**
 * Zod schema for paginated staff directory filters and sorting.
 */
export const listStaffQuerySchema = z
  .object({
    role: z.enum(UserRole).optional(),
    status: z.enum(UserStatus).optional(),
    q: zSanitizedString({ min: 1, max: 100 }).optional(),
    page: zNumericString({ integer: true, min: 1 }).default(1),
    limit: zNumericString({ integer: true, min: 1, max: 100 }).default(20),
    sort: z.enum(STAFF_SORT_OPTIONS).default("createdAt:desc"),
  })
  .strict();

/**
 * Validated staff directory query input.
 */
export type ListStaffQuery = z.infer<typeof listStaffQuerySchema>;

/**
 * Query parameters DTO for paginated staff directory listing (`GET /api/v1/admin/users`).
 */
export class ListStaffQueryDto extends createZodDto(listStaffQuerySchema) {
  public static readonly zodSchema = listStaffQuerySchema;
}
