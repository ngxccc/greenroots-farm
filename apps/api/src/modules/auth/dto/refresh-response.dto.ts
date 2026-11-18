import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const refreshResponseSchema = z.object({
  accessToken: z.string().describe("Newly issued 15-minute JWT access token"),
  refreshToken: z.string().describe("Newly issued 7-day opaque refresh token"),
});

export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
export type RefreshResponseDtoType = RefreshResponse;

export class RefreshResponseDto extends createZodDto(refreshResponseSchema) {
  public static readonly zodSchema = refreshResponseSchema;
}
