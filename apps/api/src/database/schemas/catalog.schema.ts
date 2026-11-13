import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  snakeCase,
  text,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  BatchStatus,
  WasteLogStatus,
  type ProductImageUrls,
  type WasteLogMediaUrls,
} from "@greenroots/shared";
import { batchStatusEnum, wasteLogStatusEnum } from "./enums.schema";
import { baseEntity, softDeleteEntity } from "./helpers.schema";
import { users } from "./user.schema";
import { seasons } from "./farm.schema";

export const categories = snakeCase.table(
  "categories",
  {
    ...softDeleteEntity,
    name: varchar({ length: 255 }).notNull(),
    slug: varchar({ length: 255 }).notNull(),
    description: text(),
    parentId: uuid().references((): AnyPgColumn => categories.id, {
      onDelete: "set null",
    }),
    sortOrder: integer().default(0).notNull(),
    isActive: boolean().default(true).notNull(),
  },
  (table) => [
    uniqueIndex("categories_name_uidx")
      .on(table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("categories_slug_uidx")
      .on(table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
    index("categories_parent_id_idx").on(table.parentId),
    index("categories_is_active_idx").on(table.isActive),
  ],
);

export const products = snakeCase.table(
  "products",
  {
    ...softDeleteEntity,
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    name: varchar({ length: 255 }).notNull(),
    slug: varchar({ length: 255 }).notNull(),
    description: text(),
    basePrice: integer().notNull(),
    unit: varchar({ length: 50 }).default("kg").notNull(),
    imageUrls: jsonb().$type<ProductImageUrls>(),
    isSubscriptionEligible: boolean().default(true).notNull(),
    isActive: boolean().default(true).notNull(),
  },
  (table) => [
    uniqueIndex("products_slug_uidx")
      .on(table.slug)
      .where(sql`${table.deletedAt} IS NULL`),
    index("products_category_id_idx").on(table.categoryId),
    check("products_base_price_non_negative", sql`${table.basePrice} >= 0`),
  ],
);

export const batches = snakeCase.table(
  "batches",
  {
    ...baseEntity,
    batchCode: varchar({ length: 100 }).notNull(),
    seasonId: uuid()
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    harvestDate: date().notNull(),
    expirationDate: date().notNull(),
    initialQuantity: numeric({ precision: 10, scale: 2 }).notNull(),
    availableQuantity: numeric({ precision: 10, scale: 2 }).notNull(),
    qrCodeUrl: text(),
    status: batchStatusEnum().default(BatchStatus.IN_STOCK).notNull(),
  },
  (table) => [
    uniqueIndex("batches_batch_code_uidx").on(table.batchCode),
    index("batches_product_id_idx").on(table.productId),
    index("batches_fefo_outbound_idx").on(table.expirationDate, table.status),
    check(
      "batches_initial_quantity_non_negative",
      sql`${table.initialQuantity} >= 0`,
    ),
    check(
      "batches_available_quantity_non_negative",
      sql`${table.availableQuantity} >= 0`,
    ),
  ],
);

export const wasteLogs = snakeCase.table(
  "waste_logs",
  {
    ...baseEntity,
    batchId: uuid()
      .notNull()
      .references(() => batches.id, { onDelete: "restrict" }),
    reportedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approvedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    discardedQuantity: numeric({ precision: 10, scale: 2 }).notNull(),
    reason: varchar({ length: 255 }).notNull(),
    mediaUrls: jsonb().$type<WasteLogMediaUrls>().notNull(),
    status: wasteLogStatusEnum()
      .default(WasteLogStatus.PENDING_APPROVAL)
      .notNull(),
  },
  (table) => [
    index("waste_logs_batch_id_idx").on(table.batchId),
    index("waste_logs_status_idx").on(table.status),
  ],
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Batch = typeof batches.$inferSelect;
export type NewBatch = typeof batches.$inferInsert;
export type WasteLog = typeof wasteLogs.$inferSelect;
export type NewWasteLog = typeof wasteLogs.$inferInsert;
