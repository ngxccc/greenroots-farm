import type { DeliveryDay } from "@greenroots/shared";

/** Recurring vegetable box subscription plan presented on the SF-04 storefront page. */
export interface StorefrontSubscriptionPlan {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly priceVnd: number;
  readonly weightPerDeliveryKg: number;
  readonly totalDeliveries: number;
  readonly supportedDeliveryDays: readonly DeliveryDay[];
}
