import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { UserRole, UserStatus } from "@greenroots/shared";
import { zUuidV7 } from "@/common/schemas/zod-primitives";

export const userProfileSchema = z.object({
  id: zUuidV7(),
  email: z.string(),
  fullName: z.string().min(1).max(100),
  phone: z.string().nullable(),
  role: z.enum(UserRole),
  status: z.enum(UserStatus),
  rewardPoints: z.number().int().min(0),
  emailVerified: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type UserProfileDtoType = UserProfile;

export class UserProfileDto extends createZodDto(userProfileSchema) {
  public static readonly zodSchema = userProfileSchema;
}
