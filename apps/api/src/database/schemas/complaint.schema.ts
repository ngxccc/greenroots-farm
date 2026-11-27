import {
  check,
  index,
  integer,
  jsonb,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  ComplaintCategory,
  ComplaintStatus,
  type ComplaintProofImageUrls,
} from "@greenroots/shared";
import {
  complaintCategoryEnum,
  complaintRefundChannelEnum,
  complaintResolutionEnum,
  complaintStatusEnum,
} from "./enums.schema";
import { baseEntity } from "./helpers.schema";
import { users } from "./user.schema";
import { orders } from "./order.schema";

export const complaints = snakeCase.table(
  "complaints",
  {
    ...baseEntity,
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    customerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    resolvedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    category: complaintCategoryEnum()
      .default(ComplaintCategory.OTHER)
      .notNull(),
    affectedOrderItemIds: jsonb().$type<string[]>().default([]).notNull(),
    reason: text().notNull(),
    proofImageUrls: jsonb().$type<ComplaintProofImageUrls>().notNull(),
    proofVideoUrl: varchar({ length: 500 }),
    status: complaintStatusEnum().default(ComplaintStatus.PENDING).notNull(),
    resolution: complaintResolutionEnum(),
    triagedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    triagedAt: timestamp({ withTimezone: true, mode: "date" }),
    triageNote: text(),
    resolvedAt: timestamp({ withTimezone: true, mode: "date" }),
    resolutionNote: text(),
    refundChannel: complaintRefundChannelEnum(),
    refundAmountVnd: integer(),
    replacementOrderId: uuid().references(() => orders.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("complaints_order_id_uidx").on(table.orderId),
    index("complaints_customer_id_idx").on(table.customerId),
    index("complaints_status_idx").on(table.status),
    index("complaints_triaged_by_idx").on(table.triagedBy),
    index("complaints_replacement_order_id_idx").on(table.replacementOrderId),
    check(
      "complaints_refund_amount_vnd_positive",
      sql`${table.refundAmountVnd} IS NULL OR ${table.refundAmountVnd} > 0`,
    ),
  ],
);

export type Complaint = typeof complaints.$inferSelect;
export type NewComplaint = typeof complaints.$inferInsert;
