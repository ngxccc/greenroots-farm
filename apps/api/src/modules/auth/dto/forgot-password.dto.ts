import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { zEmail } from "@/common/schemas/zod-primitives";

export const forgotPasswordSchema = z
  .object({
    email: zEmail(),
  })
  .strict();

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ForgotPasswordDtoType = ForgotPasswordInput;

export class ForgotPasswordDto extends createZodDto(forgotPasswordSchema) {
  public static readonly zodSchema = forgotPasswordSchema;
}
