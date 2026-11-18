import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import { zPassword } from "@/common/schemas/zod-primitives";

export const resetPasswordSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(1, { message: MESSAGES.VALIDATION.REQUIRED })
      .max(64),
    password: zPassword(),
    confirmPassword: z
      .string()
      .min(8, { message: MESSAGES.VALIDATION.PASSWORD_MIN_LENGTH }),
  })
  .strict()
  .refine((data) => data.password === data.confirmPassword, {
    message: MESSAGES.VALIDATION.PASSWORDS_MUST_MATCH,
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ResetPasswordDtoType = ResetPasswordInput;

export class ResetPasswordDto extends createZodDto(resetPasswordSchema) {
  public static readonly zodSchema = resetPasswordSchema;
}
