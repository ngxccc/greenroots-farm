import type {
  DeliveryQuote,
  GeoCoordinate,
  ShippingQuoteConfig,
} from "@greenroots/shared";

/**
 * Pure computation input passed to a `ShippingDriver` adapter.
 */
export interface ShippingQuoteInput {
  readonly origin: GeoCoordinate;
  readonly destination: GeoCoordinate;
  readonly config: ShippingQuoteConfig;
  readonly isSubscription: boolean;
}

/**
 * Quote result returned by a `ShippingDriver` adapter.
 */
export type ShippingDriverQuote = DeliveryQuote;

/**
 * Contract for distance and delivery fee calculation drivers.
 */
export interface ShippingDriver {
  calculateQuote(input: ShippingQuoteInput): Promise<ShippingDriverQuote>;
}
