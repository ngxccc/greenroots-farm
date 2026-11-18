import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { UserRole, UserStatus } from "@greenroots/shared";
import { zEmail, zUuidV7 } from "@/common/schemas/zod-primitives";

export const userInfoSchema = z.object({
  id: zUuidV7(),
  email: zEmail(),
  fullName: z.string(),
  role: z.enum(UserRole),
  status: z.enum(UserStatus),
});

export const loginResponseSchema = z.object({
  accessToken: z.string().describe("15-minute JWT access token"),
  refreshToken: z.string().describe("7-day opaque refresh token"),
  user: userInfoSchema,
});

export type UserInfo = z.infer<typeof userInfoSchema>;
export type UserInfoDtoType = UserInfo;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type LoginResponseDtoType = LoginResponse;

export class UserInfoDto extends createZodDto(userInfoSchema) {
  public static readonly zodSchema = userInfoSchema;
}

export class LoginResponseDto extends createZodDto(loginResponseSchema) {
  public static readonly zodSchema = loginResponseSchema;
}
