import { randomUUID } from "node:crypto";
import type { DrizzleDB } from "@/database/database.module";
import {
  subscriptionPlans,
  type NewSubscriptionPlan,
  type SubscriptionPlan,
} from "@/database/schemas";

/**
 * Inserts a subscription plan test fixture with sensible defaults.
 *
 * @param db Isolated worker Drizzle database instance.
 * @param overrides Partial column overrides.
 * @returns Inserted `subscription_plans` row.
 */
export async function createSubscriptionPlan(
  db: DrizzleDB,
  overrides: Partial<NewSubscriptionPlan> = {},
): Promise<SubscriptionPlan> {
  const uid = randomUUID().slice(0, 8);

  const [plan] = await db
    .insert(subscriptionPlans)
    .values({
      name: `Gói Rau Hữu Cơ ${uid}`,
      slug: `goi-rau-huu-co-${uid}`,
      description: "Gói rau hữu cơ theo mùa giao định kỳ.",
      price: 1200000,
      totalDeliveries: 8,
      weightPerDeliveryKg: "5.00",
      basketDescription: "2kg rau ăn lá + 2kg rau củ + 1kg rau gia vị.",
      isActive: true,
      ...overrides,
    })
    .returning();

  if (!plan) {
    throw new Error("Failed to create SubscriptionPlan entity in test factory");
  }

  return plan;
}
