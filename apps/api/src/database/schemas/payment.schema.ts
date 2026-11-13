import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  type PaymentRawPayload,
} from "@greenroots/shared";
import {
  paymentMethodEnum,
  paymentStatusEnum,
  paymentTransactionTypeEnum,
} from "./enums.schema";
import { baseEntity } from "./helpers.schema";
import { users } from "./user.schema";
import { orders } from "./order.schema";
import { subscriptions } from "./subscription.schema";

export const payments = snakeCase.table(
  "payments",
  {
    ...baseEntity,
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    subscriptionId: uuid().references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    amount: integer().notNull(),
    paymentMethod: paymentMethodEnum().default(PaymentMethod.COD).notNull(),
    status: paymentStatusEnum().default(PaymentStatus.PENDING).notNull(),
    transactionType: paymentTransactionTypeEnum()
      .default(PaymentTransactionType.PAYMENT)
      .notNull(),
    orderCode: bigint({ mode: "number" }),
    referenceCode: text(),
    paymentUrl: text(),
    rawPayload: jsonb().$type<PaymentRawPayload>(),
    verifiedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    paidAt: timestamp({ withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("payments_order_id_idx").on(table.orderId),
    index("payments_subscription_id_idx").on(table.subscriptionId),
    uniqueIndex("payments_order_code_uidx").on(table.orderCode),
    uniqueIndex("payments_reference_code_uidx").on(table.referenceCode),
    index("payments_status_idx").on(table.status),
    check(
      "payments_order_or_subscription_required",
      sql`${table.orderId} IS NOT NULL OR ${table.subscriptionId} IS NOT NULL`,
    ),
  ],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
