import { api, extractApiErrorMessage } from "@/lib/api-client";
import type {
  CreateSubscriptionPlanDto,
  SubscriptionPlanDto,
  UpdateSubscriptionPlanDto,
} from "./plans-utils";

/** TanStack Query cache keys for subscription plans management. */
export const SUBSCRIPTION_PLANS_QUERY_KEYS = {
  adminList: ["admin", "subscription-plans"] as const,
};

/**
 * Fetches all non-deleted subscription plans (including retired plans) for backoffice.
 */
export async function fetchAdminSubscriptionPlans(): Promise<
  SubscriptionPlanDto[]
> {
  const { data, error } = await api.GET("/api/v1/subscription-plans/admin");

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể tải danh sách gói định kỳ."),
    );
  }

  return data.data;
}

/**
 * Creates a new seasonal subscription plan.
 */
export async function createSubscriptionPlan(
  payload: CreateSubscriptionPlanDto,
): Promise<SubscriptionPlanDto> {
  const { data, error } = await api.POST("/api/v1/subscription-plans", {
    body: payload,
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể tạo gói định kỳ mới."),
    );
  }

  return data.data;
}

/**
 * Partially updates or soft-retires/reactivates a seasonal subscription plan.
 */
export async function updateSubscriptionPlan(
  id: string,
  payload: UpdateSubscriptionPlanDto,
): Promise<SubscriptionPlanDto> {
  const { data, error } = await api.PATCH("/api/v1/subscription-plans/{id}", {
    params: { path: { id } },
    body: payload,
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể cập nhật gói định kỳ."),
    );
  }

  return data.data;
}
