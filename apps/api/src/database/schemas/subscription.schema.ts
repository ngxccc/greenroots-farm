import {
  boolean,
  date,
  index,
  integer,
  numeric,
  snakeCase,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { DeliveryDay, SubscriptionStatus } from "@greenroots/shared";
import { deliveryDayEnum, subscriptionStatusEnum } from "./enums.schema";
import { baseEntity, softDeleteEntity } from "./helpers.schema";
import { userAddresses, users } from "./user.schema";

export const subscriptionPlans = snakeCase.table(
  "subscription_plans",
  {
    ...softDeleteEntity,
    name: varchar({ length: 255 }).notNull(),
    slug: varchar({ length: 255 }).notNull(),
    description: text().notNull(),
    price: integer().notNull(),
    totalDeliveries: integer().default(8).notNull(),
    weightPerDeliveryKg: numeric({ precision: 5, scale: 2 })
      .default("5.00")
      .notNull(),
    basketDescription: text().notNull(),
    isActive: boolean().default(true).notNull(),
  },
  (table) => [
    uniqueIndex("subscription_plans_slug_uidx")
      .on(table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
    index("subscription_plans_is_active_idx").on(table.isActive),
  ],
);

export const subscriptions = snakeCase.table(
  "subscriptions",
  {
    ...baseEntity,
    customerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    planId: uuid().references(() => subscriptionPlans.id, {
      onDelete: "set null",
    }),
    userAddressId: uuid().references(() => userAddresses.id, {
      onDelete: "set null",
    }),
    shippingAddress: text().notNull(),
    shippingDistanceKm: numeric({ precision: 6, scale: 2 })
      .default("0")
      .notNull(),
    shippingFeePerDelivery: integer().default(0).notNull(),
    planName: varchar({ length: 255 }).notNull(),
    price: integer().notNull(),
    totalDeliveries: integer().notNull(),
    weightPerDeliveryKg: numeric({ precision: 5, scale: 2 }).notNull(),
    basketDescription: text().notNull(),
    deliveryDay: deliveryDayEnum().default(DeliveryDay.TUESDAY).notNull(),
    remainingDeliveries: integer().notNull(),
    status: subscriptionStatusEnum()
      .default(SubscriptionStatus.ACTIVE)
      .notNull(),
    startDate: date().notNull(),
    endDate: date().notNull(),
  },
  (table) => [
    index("subscriptions_customer_id_idx").on(table.customerId),
    index("subscriptions_plan_id_idx").on(table.planId),
    index("subscriptions_status_idx").on(table.status),
  ],
);

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlans.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
