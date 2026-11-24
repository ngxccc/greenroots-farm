import {
  BUSINESS_RULES,
  calculateDeliveryQuote,
  type DeliveryQuote,
  type HcmcDistrictCoordinate,
} from "@greenroots/shared";

/**
 * Estimates a district-level delivery preview quote using static `BUSINESS_RULES` defaults
 * for unauthenticated storefront display prior to checkout quote integration.
 *
 * @param district Target HCMC district entry from `HCMC_DISTRICTS`.
 * @returns Estimated delivery quote with integer VND fee or `feeVnd: null` when out of radius.
 */
export function estimateDistrictPreviewQuote(
  district: HcmcDistrictCoordinate,
): DeliveryQuote {
  return calculateDeliveryQuote(
    {
      latitude: BUSINESS_RULES.FULFILLMENT_HUB.LATITUDE,
      longitude: BUSINESS_RULES.FULFILLMENT_HUB.LONGITUDE,
    },
    {
      latitude: district.latitude,
      longitude: district.longitude,
    },
    {
      baseFeeVnd: BUSINESS_RULES.SHIPPING.BASE_FEE_VND,
      freeKmThreshold: BUSINESS_RULES.SHIPPING.FREE_KM_THRESHOLD,
      perKmRateVnd: BUSINESS_RULES.SHIPPING.PER_KM_RATE_VND,
      detourFactor: BUSINESS_RULES.SHIPPING.DETOUR_FACTOR,
      maxRadiusKm: BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM,
      subscriptionFreeRadiusKm:
        BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM,
    },
  );
}
