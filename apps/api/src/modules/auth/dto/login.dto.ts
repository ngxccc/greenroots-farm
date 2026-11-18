import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import { zEmail } from "@/common/schemas/zod-primitives";

export const loginSchema = z
  .object({
    email: zEmail(),
    password: z
      .string()
      .min(1, { message: MESSAGES.VALIDATION.REQUIRED })
      .max(128, { message: MESSAGES.VALIDATION.PASSWORD_MAX_LENGTH }),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
export type LoginDtoType = LoginInput;

export class LoginDto extends createZodDto(loginSchema) {
  public static readonly zodSchema = loginSchema;
}
