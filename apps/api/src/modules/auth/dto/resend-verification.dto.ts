import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { zEmail } from "@/common/schemas/zod-primitives";

export const resendVerificationSchema = z
  .object({
    email: zEmail(),
  })
  .strict();

export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type ResendVerificationDtoType = ResendVerificationInput;

export class ResendVerificationDto extends createZodDto(
  resendVerificationSchema,
) {
  public static readonly zodSchema = resendVerificationSchema;
}
