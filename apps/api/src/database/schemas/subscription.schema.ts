import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  snakeCase,
  text,
  timestamp,
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
    check("subscription_plans_price_positive", sql`${table.price} > 0`),
    check(
      "subscription_plans_total_deliveries_positive",
      sql`${table.totalDeliveries} > 0`,
    ),
    check(
      "subscription_plans_weight_per_delivery_kg_positive",
      sql`${table.weightPerDeliveryKg} > 0`,
    ),
  ],
);

export const subscriptions = snakeCase.table(
  "subscriptions",
  {
    ...baseEntity,
    subscriptionCode: varchar({ length: 50 }).notNull(),
    customerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    planId: uuid().references(() => subscriptionPlans.id, {
      onDelete: "set null",
    }),
    userAddressId: uuid().references(() => userAddresses.id, {
      onDelete: "set null",
    }),
    receiverName: varchar({ length: 255 }).notNull(),
    receiverPhone: varchar({ length: 20 }).notNull(),
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
      .default(SubscriptionStatus.PENDING_PAYMENT)
      .notNull(),
    reservationExpiresAt: timestamp({ withTimezone: true, mode: "date" }),
    startDate: date().notNull(),
    endDate: date().notNull(),
  },
  (table) => [
    uniqueIndex("subscriptions_subscription_code_uidx").on(
      table.subscriptionCode,
    ),
    index("subscriptions_customer_id_idx").on(table.customerId),
    index("subscriptions_customer_created_id_idx").on(
      table.customerId,
      table.createdAt,
      table.id,
    ),
    index("subscriptions_plan_id_idx").on(table.planId),
    index("subscriptions_status_idx").on(table.status),
    index("subscriptions_reservation_expires_at_idx")
      .on(table.reservationExpiresAt)
      .where(
        sql`${table.status} = ${SubscriptionStatus.PENDING_PAYMENT} AND ${table.reservationExpiresAt} IS NOT NULL`,
      ),
    check("subscriptions_price_non_negative", sql`${table.price} >= 0`),
    check(
      "subscriptions_total_deliveries_positive",
      sql`${table.totalDeliveries} > 0`,
    ),
    check(
      "subscriptions_remaining_deliveries_non_negative",
      sql`${table.remainingDeliveries} >= 0`,
    ),
    check(
      "subscriptions_remaining_within_total",
      sql`${table.remainingDeliveries} <= ${table.totalDeliveries}`,
    ),
    check(
      "subscriptions_shipping_fee_non_negative",
      sql`${table.shippingFeePerDelivery} >= 0`,
    ),
    check(
      "subscriptions_date_range_valid",
      sql`${table.endDate} >= ${table.startDate}`,
    ),
  ],
);

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlans.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
