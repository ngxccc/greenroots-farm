import { timestamp, uuid } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

/**
 * UUIDv7 primary key: time-sortable and generated client-side by Drizzle.
 */
export const primaryKeyUuid = {
  id: uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7()),
};

export const baseTimestamps = {
  createdAt: timestamp({ withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp({ withTimezone: true, mode: "date" })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

/** Timestamps plus a nullable soft-delete marker. */
export const softDeleteTimestamp = {
  deletedAt: timestamp({ withTimezone: true, mode: "date" }),
};

/** Base entity for mutable tables without soft delete. */
export const baseEntity = {
  ...primaryKeyUuid,
  ...baseTimestamps,
};

/**
 * Entity for the five soft-deletable tables only:
 * users, plots, categories, products, subscription_plans.
 */
export const softDeleteEntity = {
  ...baseEntity,
  ...softDeleteTimestamp,
};
