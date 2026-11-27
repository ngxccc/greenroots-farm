import { DeliveryDay } from "@greenroots/shared";
import type { ShippingQuote } from "@/features/shipping/types/shipping.types";
import type { StorefrontSubscriptionPlan } from "@/types/subscription.types";

/**
 * Computed shipping and prepaid checkout totals for an SF-04 subscription selection.
 */
export interface SubscriptionCheckoutTotals {
  readonly isFreeShipping: boolean;
  readonly shippingFeePerDeliveryVnd: number | null;
  readonly totalShippingFeeVnd: number | null;
  readonly totalAmountVnd: number | null;
}

/**
 * Computes deterministic payload signature for `POST /api/v1/subscriptions`
 * so identical retries reuse the same UUIDv4 `Idempotency-Key` while changing
 * `planId`, `addressId`, or `deliveryDay` rotates the key (`INV-SF04-4`).
 *
 * @param params Subscription selection fields bound to the idempotency key.
 * @returns Stable serialized signature string.
 */
export function buildSubscriptionCheckoutSignature(params: {
  readonly planId: string;
  readonly addressId?: string | null;
  readonly deliveryDay: DeliveryDay;
}): string {
  return JSON.stringify({
    planId: params.planId,
    addressId: params.addressId ?? null,
    deliveryDay: params.deliveryDay,
  });
}

/**
 * Calculates per-delivery shipping, total cycle shipping (`totalDeliveries * feeVnd`),
 * and prepaid PayOS grand total from the active address's `isSubscription: true` quote (`INV-SF04-3`).
 *
 * @param plan Selected subscription plan.
 * @param quote Server-computed shipping quote for `activeAddressId`, or `null` when unavailable.
 * @returns Shipping and grand total breakdown; shipping fields are `null` when `!quote?.isDeliverable`.
 */
export function calculateSubscriptionCheckoutTotals(
  plan: Pick<StorefrontSubscriptionPlan, "priceVnd" | "totalDeliveries">,
  quote: ShippingQuote | null,
): SubscriptionCheckoutTotals {
  if (!quote || !quote.isDeliverable || quote.feeVnd === null) {
    return {
      isFreeShipping: false,
      shippingFeePerDeliveryVnd: null,
      totalShippingFeeVnd: null,
      totalAmountVnd: null,
    };
  }

  const isFreeShipping = quote.isFreeShipping || quote.feeVnd === 0;
  const shippingFeePerDeliveryVnd = isFreeShipping ? 0 : quote.feeVnd;
  const totalShippingFeeVnd = shippingFeePerDeliveryVnd * plan.totalDeliveries;

  return {
    isFreeShipping,
    shippingFeePerDeliveryVnd,
    totalShippingFeeVnd,
    totalAmountVnd: plan.priceVnd + totalShippingFeeVnd,
  };
}
