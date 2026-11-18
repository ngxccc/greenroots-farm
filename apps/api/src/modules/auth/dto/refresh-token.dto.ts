import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";

export const refreshTokenSchema = z
  .object({
    refreshToken: z
      .string()
      .trim()
      .min(1, { message: MESSAGES.VALIDATION.REQUIRED })
      .max(255),
  })
  .strict();

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type RefreshTokenDtoType = RefreshTokenInput;

export class RefreshTokenDto extends createZodDto(refreshTokenSchema) {
  public static readonly zodSchema = refreshTokenSchema;
}
