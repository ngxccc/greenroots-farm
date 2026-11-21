import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/**
 * Zod schema for the closed `POST /api/v1/shipping/quote` response payload.
 * Geographic coordinates are intentionally excluded per ADR-0018 and ADR-0030.
 */
export const shippingQuoteSchema = z.object({
  straightLineKm: z.number().nonnegative(),
  roadDistanceKm: z.number().nonnegative(),
  feeVnd: z.number().int().nonnegative().nullable(),
  isDeliverable: z.boolean(),
  isFreeShipping: z.boolean(),
  maxRadiusKm: z.number().positive(),
  subscriptionFreeRadiusKm: z.number().positive(),
});

/**
 * Serialized delivery quote payload returned by `ShippingService` and `/shipping/quote`.
 */
export type ShippingQuote = z.infer<typeof shippingQuoteSchema>;

/**
 * Response DTO for `POST /api/v1/shipping/quote`.
 */
export class ShippingQuoteDto extends createZodDto(shippingQuoteSchema) {
  public static readonly zodSchema = shippingQuoteSchema;
}
