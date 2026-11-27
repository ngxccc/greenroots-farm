import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";

export const logoutSchema = z
  .object({
    refreshToken: z
      .string()
      .trim()
      .min(1, { message: MESSAGES.VALIDATION.REQUIRED })
      .max(255)
      .optional(),
  })
  .strict()
  .optional()
  .default({});

export type LogoutInput = z.infer<typeof logoutSchema>;
export type LogoutDtoType = LogoutInput;

/**
 * Logout request DTO allowing optional body token when staff sessions authenticate via HttpOnly cookie.
 */
export class LogoutDto extends createZodDto(logoutSchema) {
  public static readonly zodSchema = logoutSchema;
}
