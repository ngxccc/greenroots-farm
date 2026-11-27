import type { components } from "@/types/api-schema";

/** Generated OpenAPI contract for a public subscription plan. */
export type SubscriptionPlanDto = components["schemas"]["SubscriptionPlanDto"];

/**
 * Storefront projection of an active subscription plan with derived per-delivery unit price.
 */
export interface StorefrontSubscriptionPlan {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly priceVnd: number;
  readonly totalDeliveries: number;
  readonly weightPerDeliveryKg: number;
  readonly basketDescription: string;
  readonly isActive: boolean;
  readonly unitPriceVnd: number;
}

/**
 * Result of fetching live subscription plans from the backend API.
 */
export interface SubscriptionPlansResult {
  readonly plans: readonly StorefrontSubscriptionPlan[];
  readonly apiReachable: boolean;
}
