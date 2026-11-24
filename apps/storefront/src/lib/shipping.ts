import type { components } from "@/types/api-schema";

/**
 * Server-computed shipping quote payload returned by `POST /api/v1/shipping/quote` (`ADR-0030`).
 */
export type ShippingQuote = components["schemas"]["ShippingQuoteDto"];

/**
 * Request payload accepted by `POST /api/v1/shipping/quote` (`addressId` XOR `districtCode`).
 */
export type ShippingQuoteRequest =
  components["schemas"]["ShippingQuoteRequestDto"];
