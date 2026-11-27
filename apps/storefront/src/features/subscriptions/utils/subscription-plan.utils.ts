import { DELIVERY_DAY_LABELS, DeliveryDay } from "@greenroots/shared";

/**
 * Fixed morning delivery window for GreenRoots subscription baskets.
 */
export const SUBSCRIPTION_DELIVERY_TIME_WINDOW = "06:30 – 09:00";

/**
 * Selectable delivery day option for the SF-04 schedule selector.
 */
export interface SubscriptionDeliveryOption {
  readonly day: DeliveryDay;
  readonly label: string;
  readonly timeWindow: string;
}

/**
 * Ordered delivery day options supported by SF-04 subscriptions.
 */
export const SUBSCRIPTION_DELIVERY_OPTIONS: readonly SubscriptionDeliveryOption[] =
  [
    {
      day: DeliveryDay.TUESDAY,
      label: DELIVERY_DAY_LABELS[DeliveryDay.TUESDAY],
      timeWindow: SUBSCRIPTION_DELIVERY_TIME_WINDOW,
    },
    {
      day: DeliveryDay.FRIDAY,
      label: DELIVERY_DAY_LABELS[DeliveryDay.FRIDAY],
      timeWindow: SUBSCRIPTION_DELIVERY_TIME_WINDOW,
    },
    {
      day: DeliveryDay.BOTH,
      label: DELIVERY_DAY_LABELS[DeliveryDay.BOTH],
      timeWindow: SUBSCRIPTION_DELIVERY_TIME_WINDOW,
    },
  ];

/**
 * Calculates total subscription duration in weeks from `totalDeliveries` and `DeliveryDay`.
 *
 * @param totalDeliveries Total number of deliveries in the plan.
 * @param deliveryDay Selected fixed delivery day schedule.
 * @returns Duration in weeks (`0` when `totalDeliveries <= 0`).
 */
export function calculateSubscriptionWeeks(
  totalDeliveries: number,
  deliveryDay: DeliveryDay,
): number {
  if (totalDeliveries <= 0) {
    return 0;
  }
  return deliveryDay === DeliveryDay.BOTH
    ? Math.ceil(totalDeliveries / 2)
    : totalDeliveries;
}

/**
 * Formats Vietnamese duration summary including weekly delivery cadence.
 *
 * @param totalDeliveries Total number of deliveries in the plan.
 * @param deliveryDay Selected fixed delivery day schedule.
 * @returns Formatted duration label, e.g. `"4 tuần (2 chuyến/tuần)"`.
 */
export function formatSubscriptionDurationLabel(
  totalDeliveries: number,
  deliveryDay: DeliveryDay,
): string {
  const weeks = calculateSubscriptionWeeks(totalDeliveries, deliveryDay);
  const tripsPerWeek = deliveryDay === DeliveryDay.BOTH ? 2 : 1;
  return `${weeks} tuần (${tripsPerWeek} chuyến/tuần)`;
}
