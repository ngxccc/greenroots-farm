import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import type { PayosWebhookPayload } from "../payments.interface";

/**
 * Zod schema for incoming PayOS webhook envelopes (`POST /api/v1/payments/payos/webhook`).
 * Intentionally avoids `.strict()` on `data` so unknown PayOS fields remain intact for HMAC-SHA256 verification.
 */
export const payosWebhookRequestSchema = z
  .object({
    code: z.string(),
    desc: z.string(),
    success: z.boolean().optional(),
    data: z.record(z.string(), z.unknown()),
    signature: z.string().optional().default(""),
  })
  .strict() satisfies z.ZodType<PayosWebhookPayload>;

/**
 * Zod schema for the webhook acknowledgement payload.
 */
export const payosWebhookResponseSchema = z.object({
  received: z.boolean(),
});

/** Validated PayOS webhook envelope type. */
export type PayosWebhookRequestInput = z.infer<
  typeof payosWebhookRequestSchema
>;

/** Webhook acknowledgement response type. */
export type PayosWebhookResponse = z.infer<typeof payosWebhookResponseSchema>;

/**
 * Request DTO for `POST /api/v1/payments/payos/webhook`.
 */
export class PayosWebhookRequestDto extends createZodDto(
  payosWebhookRequestSchema,
) {
  public static readonly zodSchema = payosWebhookRequestSchema;
}

/**
 * Response DTO for `POST /api/v1/payments/payos/webhook`.
 */
export class PayosWebhookResponseDto extends createZodDto(
  payosWebhookResponseSchema,
) {
  public static readonly zodSchema = payosWebhookResponseSchema;
}
