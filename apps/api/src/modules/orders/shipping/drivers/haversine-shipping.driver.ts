import { Injectable } from "@nestjs/common";
import { calculateDeliveryQuote } from "@greenroots/shared";
import type {
  ShippingDriver,
  ShippingDriverQuote,
  ShippingQuoteInput,
} from "../shipping.interface";

/**
 * Haversine-based shipping driver using shared distance and VND pricing rules.
 */
@Injectable()
export class HaversineShippingDriver implements ShippingDriver {
  /**
   * Calculates a deterministic delivery quote from pure coordinates and shipping config.
   *
   * @param input Origin, destination, resolved shipping rules, and subscription flag.
   * @returns Computed delivery quote with integer VND fee or `null` when undeliverable.
   */
  calculateQuote(input: ShippingQuoteInput): Promise<ShippingDriverQuote> {
    return Promise.resolve(
      calculateDeliveryQuote(input.origin, input.destination, input.config, {
        isSubscription: input.isSubscription,
      }),
    );
  }
}
