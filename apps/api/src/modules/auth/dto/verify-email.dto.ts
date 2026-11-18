import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";

export const verifyEmailSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(1, { message: MESSAGES.VALIDATION.REQUIRED })
      .max(64),
  })
  .strict();

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type VerifyEmailDtoType = VerifyEmailInput;

export class VerifyEmailDto extends createZodDto(verifyEmailSchema) {
  public static readonly zodSchema = verifyEmailSchema;
}
