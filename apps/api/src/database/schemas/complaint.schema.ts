import {
  index,
  jsonb,
  snakeCase,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  ComplaintStatus,
  type ComplaintProofImageUrls,
} from "@greenroots/shared";
import { complaintResolutionEnum, complaintStatusEnum } from "./enums.schema";
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
    reason: text().notNull(),
    proofImageUrls: jsonb().$type<ComplaintProofImageUrls>().notNull(),
    proofVideoUrl: varchar({ length: 500 }),
    status: complaintStatusEnum().default(ComplaintStatus.PENDING).notNull(),
    resolution: complaintResolutionEnum(),
  },
  (table) => [
    uniqueIndex("complaints_order_id_uidx").on(table.orderId),
    index("complaints_customer_id_idx").on(table.customerId),
    index("complaints_status_idx").on(table.status),
  ],
);

export type Complaint = typeof complaints.$inferSelect;
export type NewComplaint = typeof complaints.$inferInsert;
