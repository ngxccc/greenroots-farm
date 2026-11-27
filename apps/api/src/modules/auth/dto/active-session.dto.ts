import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { zUuidV7 } from "@/common/schemas/zod-primitives";

export const activeSessionSchema = z.object({
  id: zUuidV7().describe("Unique identifier of the refresh token session"),
  deviceName: z
    .string()
    .nullable()
    .describe("Sanitized device or browser label derived from User-Agent"),
  ipAddress: z
    .string()
    .nullable()
    .describe("Client IP address recorded when the session was issued"),
  createdAt: z.iso
    .datetime()
    .describe("ISO 8601 timestamp when the session was created"),
  expiresAt: z.iso
    .datetime()
    .describe("ISO 8601 timestamp when the refresh token expires"),
  isCurrent: z
    .boolean()
    .describe("Whether this session matches the caller's current access token"),
});

export type ActiveSession = z.infer<typeof activeSessionSchema>;
export type ActiveSessionDtoType = ActiveSession;

/**
 * Closed projection DTO representing an active customer refresh session.
 */
export class ActiveSessionDto extends createZodDto(activeSessionSchema) {
  public static readonly zodSchema = activeSessionSchema;
}
