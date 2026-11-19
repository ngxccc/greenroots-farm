import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { MESSAGES } from "@/common/constants/messages.constant";
import { zFullName, zPhoneNumber } from "@/common/schemas/zod-primitives";

export const updateProfileSchema = z
  .object({
    fullName: zFullName().optional(),
    phone: zPhoneNumber().nullable().optional(),
  })
  .strict()
  .refine((data) => data.fullName !== undefined || data.phone !== undefined, {
    message: MESSAGES.VALIDATION.AT_LEAST_ONE_FIELD,
  });

type AtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Omit<T, K>;
}[keyof T];

export type UpdateProfileInput = AtLeastOne<
  z.infer<typeof updateProfileSchema>
>;
export type UpdateProfileDtoType = UpdateProfileInput;

export class UpdateProfileDto extends createZodDto(updateProfileSchema) {
  public static readonly zodSchema = updateProfileSchema;
}
