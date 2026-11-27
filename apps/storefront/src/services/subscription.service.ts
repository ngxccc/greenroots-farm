import { api } from "@/lib/api-client";
import type {
  StorefrontSubscriptionPlan,
  SubscriptionPlanDto,
  SubscriptionPlansResult,
} from "@/types/subscription.types";

/**
 * Injectable fetcher boundary for `fetchLiveSubscriptionPlans` unit testing.
 */
export interface SubscriptionPlansDeps {
  readonly fetchPlans: () => Promise<{
    readonly data?: {
      readonly success?: boolean;
      readonly data?: readonly SubscriptionPlanDto[];
    };
    readonly error?: unknown;
    readonly response?: { readonly status: number };
  }>;
}

const defaultSubscriptionPlansDeps: SubscriptionPlansDeps = {
  fetchPlans: () => api.GET("/api/v1/subscription-plans"),
};

/**
 * Maps an API `SubscriptionPlanDto` to a `StorefrontSubscriptionPlan` without
 * fabricating unbacked discount percentages or retail savings.
 *
 * @param dto Public subscription plan returned by `GET /api/v1/subscription-plans`.
 * @returns Storefront subscription plan projection with integer per-delivery unit price.
 */
export function mapSubscriptionPlanDtoToStorefront(
  dto: SubscriptionPlanDto,
): StorefrontSubscriptionPlan {
  const unitPriceVnd =
    dto.totalDeliveries > 0
      ? Math.round(dto.priceVnd / dto.totalDeliveries)
      : dto.priceVnd;

  return {
    id: dto.id,
    slug: dto.slug,
    name: dto.name,
    description: dto.description,
    priceVnd: dto.priceVnd,
    totalDeliveries: dto.totalDeliveries,
    weightPerDeliveryKg: dto.weightPerDeliveryKg,
    basketDescription: dto.basketDescription,
    isActive: dto.isActive,
    unitPriceVnd,
  };
}

/**
 * Fetches active subscription plans from `GET /api/v1/subscription-plans` and
 * degrades gracefully when the API is unavailable.
 *
 * @param deps Optional injectable API fetcher for deterministic unit tests.
 * @returns Active mapped plans and API reachability flag.
 */
export async function fetchLiveSubscriptionPlans(
  deps: SubscriptionPlansDeps = defaultSubscriptionPlansDeps,
): Promise<SubscriptionPlansResult> {
  try {
    const result = await deps.fetchPlans();
    if (result.error || !result.data?.data) {
      return { plans: [], apiReachable: false };
    }

    const plans = result.data.data
      .filter((plan) => plan.isActive)
      .map(mapSubscriptionPlanDtoToStorefront);

    return { plans, apiReachable: true };
  } catch {
    return { plans: [], apiReachable: false };
  }
}
