import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  zEmail,
  zPassword,
  zPhoneNumber,
  zSanitizedString,
} from "@/common/schemas/zod-primitives";

export const registerSchema = z
  .object({
    email: zEmail(),
    fullName: zSanitizedString({ min: 1, max: 100 }),
    phoneNumber: zPhoneNumber().optional(),
    password: zPassword(),
    confirmPassword: z
      .string()
      .min(8, { message: MESSAGES.VALIDATION.PASSWORD_MIN_LENGTH }),
    agreeTerms: z.literal(true, {
      message: MESSAGES.VALIDATION.MUST_ACCEPT_TERMS,
    }),
  })
  .strict()
  .refine((data) => data.password === data.confirmPassword, {
    message: MESSAGES.VALIDATION.PASSWORDS_MUST_MATCH,
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type RegisterDtoType = RegisterInput;

export class RegisterDto extends createZodDto(registerSchema) {
  public static readonly zodSchema = registerSchema;
}
