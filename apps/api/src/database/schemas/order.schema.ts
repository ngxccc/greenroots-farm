import {
  check,
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
import { OrderStatus, PaymentMethod, PaymentStatus } from "@greenroots/shared";
import {
  orderStatusEnum,
  paymentMethodEnum,
  paymentStatusEnum,
} from "./enums.schema";
import { baseEntity, primaryKeyUuid } from "./helpers.schema";
import { users } from "./user.schema";
import { batches as batchesForAllocation, products } from "./catalog.schema";
import { subscriptions } from "./subscription.schema";

export const orders = snakeCase.table(
  "orders",
  {
    ...baseEntity,
    orderCode: varchar({ length: 50 }).notNull(),
    customerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    subscriptionId: uuid().references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    shippingAddress: text().notNull(),
    shippingDistanceKm: numeric({ precision: 6, scale: 2 })
      .default("0")
      .notNull(),
    shippingFee: integer().default(0).notNull(),
    subtotal: integer().notNull(),
    discountAmount: integer().default(0).notNull(),
    totalAmount: integer().notNull(),
    paymentMethod: paymentMethodEnum().default(PaymentMethod.COD).notNull(),
    paymentStatus: paymentStatusEnum().default(PaymentStatus.PENDING).notNull(),
    orderStatus: orderStatusEnum()
      .default(OrderStatus.PENDING_CONFIRMATION)
      .notNull(),
  },
  (table) => [
    uniqueIndex("orders_order_code_uidx").on(table.orderCode),
    index("orders_customer_id_idx").on(table.customerId),
    index("orders_subscription_id_idx").on(table.subscriptionId),
    index("orders_status_created_at_idx").on(
      table.orderStatus,
      table.createdAt,
    ),
    check("orders_shipping_fee_non_negative", sql`${table.shippingFee} >= 0`),
    check("orders_subtotal_non_negative", sql`${table.subtotal} >= 0`),
    check(
      "orders_discount_amount_non_negative",
      sql`${table.discountAmount} >= 0`,
    ),
    check("orders_total_amount_non_negative", sql`${table.totalAmount} >= 0`),
  ],
);

export const orderItems = snakeCase.table(
  "order_items",
  {
    ...primaryKeyUuid,
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: numeric({ precision: 10, scale: 2 }).notNull(),
    unitPrice: integer().notNull(),
  },
  (table) => [
    index("order_items_order_id_idx").on(table.orderId),
    index("order_items_product_id_idx").on(table.productId),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
    check("order_items_unit_price_non_negative", sql`${table.unitPrice} >= 0`),
  ],
);

export const batchAllocations = snakeCase.table(
  "batch_allocations",
  {
    ...primaryKeyUuid,
    orderItemId: uuid()
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    batchId: uuid()
      .notNull()
      .references(() => batchesForAllocation.id, { onDelete: "restrict" }),
    allocatedQuantity: numeric({ precision: 10, scale: 2 }).notNull(),
    allocatedAt: timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("batch_allocations_order_item_id_idx").on(table.orderItemId),
    index("batch_allocations_batch_id_idx").on(table.batchId),
  ],
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type BatchAllocation = typeof batchAllocations.$inferSelect;
export type NewBatchAllocation = typeof batchAllocations.$inferInsert;
