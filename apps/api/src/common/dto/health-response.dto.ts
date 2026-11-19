import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok").describe("Current service health status").meta({
    example: "ok",
  }),
  message: z
    .string()
    .describe("Human-readable operational summary")
    .meta({ example: "System is healthy and operational" }),
  timestamp: z
    .string()
    .describe("UTC ISO-8601 health check timestamp")
    .meta({ example: "2026-04-02T10:00:00.000Z" }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export class HealthResponseDto extends createZodDto(healthResponseSchema) {}
