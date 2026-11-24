import { DeliveryDay } from "@greenroots/shared";
import type { StorefrontSubscriptionPlan } from "@/types/subscription.types";

// TODO(subscriptions-api): Wire live subscription plan catalog once backend endpoint lands.
const SHOWCASE_PLANS: readonly StorefrontSubscriptionPlan[] = [
  {
    id: "plan-family-5kg",
    slug: "goi-rau-gia-dinh-1-thang",
    name: "Gói Gia Đình 5kg",
    description:
      "Giỏ rau mùa vụ cho 4–5 người, thu hoạch sáng sớm Thứ 3 hoặc Thứ 6 hàng tuần.",
    priceVnd: 1200000,
    weightPerDeliveryKg: 5,
    totalDeliveries: 8,
    supportedDeliveryDays: [
      DeliveryDay.TUESDAY,
      DeliveryDay.FRIDAY,
      DeliveryDay.BOTH,
    ],
  },
  {
    id: "plan-baby-2kg",
    slug: "goi-rau-an-dam-2kg",
    name: "Gói Ăn Dặm 2kg",
    description:
      "Rau củ mềm, đạt chuẩn dư lượng bằng 0 dành riêng cho bé ăn dặm.",
    priceVnd: 550000,
    weightPerDeliveryKg: 2,
    totalDeliveries: 8,
    supportedDeliveryDays: [DeliveryDay.TUESDAY, DeliveryDay.FRIDAY],
  },
];

/**
 * Returns the available weekly vegetable subscription plans for the `/subscriptions` page.
 *
 * @returns Ordered list of `StorefrontSubscriptionPlan` items.
 */
export function getSubscriptionPlans(): readonly StorefrontSubscriptionPlan[] {
  return SHOWCASE_PLANS;
}
