import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { userInfoSchema } from "./login-response.dto";

export const staffAuthResponseSchema = z.object({
  accessToken: z.string().describe("15-minute JWT access token"),
  user: userInfoSchema,
});

export type StaffAuthResponse = z.infer<typeof staffAuthResponseSchema>;
export type StaffAuthResponseDtoType = StaffAuthResponse;

/**
 * Staff login and refresh response DTO omitting refreshToken (delivered via HttpOnly cookie).
 */
export class StaffAuthResponseDto extends createZodDto(
  staffAuthResponseSchema,
) {
  public static readonly zodSchema = staffAuthResponseSchema;
}
