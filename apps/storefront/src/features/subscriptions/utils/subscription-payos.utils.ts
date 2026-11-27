import { SubscriptionStatus } from "@greenroots/shared";
import type { SubscriptionDto } from "../schemas/subscription.schema";

/**
 * UI phase for a subscription's PayOS VietQR payment panel on `/subscriptions/[id]`.
 */
export type SubscriptionPayosPanelPhase =
  | "pending"
  | "success"
  | "expired"
  | "none";

/**
 * Customer-facing Vietnamese labels for subscription statuses on `/subscriptions/[id]`.
 */
export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  [SubscriptionStatus.PENDING_PAYMENT]: "Chờ thanh toán",
  [SubscriptionStatus.ACTIVE]: "Đang hoạt động",
  [SubscriptionStatus.PAUSED]: "Tạm dừng",
  [SubscriptionStatus.COMPLETED]: "Đã hoàn thành",
  [SubscriptionStatus.CANCELLED]: "Đã hủy",
};

/**
 * Maps a `SubscriptionDto` status to the PayOS payment panel phase.
 *
 * @param subscription Subscription status projection fields.
 * @returns `"pending"`, `"success"`, `"expired"`, or `"none"`.
 */
export function resolveSubscriptionPayosPanelPhase(
  subscription: Pick<SubscriptionDto, "status">,
): SubscriptionPayosPanelPhase {
  switch (subscription.status) {
    case SubscriptionStatus.PENDING_PAYMENT:
      return "pending";
    case SubscriptionStatus.ACTIVE:
      return "success";
    case SubscriptionStatus.CANCELLED:
      return "expired";
    case SubscriptionStatus.PAUSED:
    case SubscriptionStatus.COMPLETED:
      return "none";
  }
}

/**
 * Computes total shipping fee across all scheduled deliveries of a subscription.
 *
 * @param subscription Shipping fee per delivery and total delivery count.
 * @returns Total shipping fee in integer VND.
 */
export function computeSubscriptionShippingTotalVnd(
  subscription: Pick<
    SubscriptionDto,
    "shippingFeePerDeliveryVnd" | "totalDeliveries"
  >,
): number {
  return subscription.shippingFeePerDeliveryVnd * subscription.totalDeliveries;
}
