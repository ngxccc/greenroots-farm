import {
  boolean,
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
import { UserRole, UserStatus } from "@greenroots/shared";
import { userRoleEnum, userStatusEnum } from "./enums.schema";
import { baseEntity, softDeleteEntity } from "./helpers.schema";

export const users = snakeCase.table(
  "users",
  {
    ...softDeleteEntity,
    email: varchar({ length: 255 }).notNull(),
    phone: varchar({ length: 20 }),
    password: varchar({ length: 255 }).notNull(),
    fullName: varchar({ length: 255 }).notNull(),
    role: userRoleEnum().default(UserRole.CUSTOMER).notNull(),
    rewardPoints: integer().default(0).notNull(),
    status: userStatusEnum().default(UserStatus.ACTIVE).notNull(),
    emailVerified: boolean().default(false).notNull(),
    verificationToken: varchar({ length: 255 }),
    verificationExpiresAt: timestamp({ withTimezone: true, mode: "date" }),
    resetPasswordToken: varchar({ length: 255 }),
    resetPasswordExpiresAt: timestamp({ withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("users_email_uidx")
      .on(table.email)
      .where(sql`${table.deletedAt} IS NULL`),
    index("users_phone_idx").on(table.phone),
    index("users_role_idx").on(table.role),
    index("users_status_idx").on(table.status),
    index("users_verification_token_idx").on(table.verificationToken),
    index("users_reset_password_token_idx").on(table.resetPasswordToken),
  ],
);

export const refreshTokens = snakeCase.table(
  "refresh_tokens",
  {
    ...baseEntity,
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: varchar({ length: 255 }).notNull(),
    deviceName: varchar({ length: 255 }),
    ipAddress: varchar({ length: 45 }),
    expiresAt: timestamp({ withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    uniqueIndex("refresh_tokens_token_uidx").on(table.token),
    index("refresh_tokens_user_id_idx").on(table.userId),
    index("refresh_tokens_expires_at_idx").on(table.expiresAt),
  ],
);

export const userAddresses = snakeCase.table(
  "user_addresses",
  {
    ...baseEntity,
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    receiverName: varchar({ length: 255 }).notNull(),
    phoneNumber: varchar({ length: 20 }).notNull(),
    streetAddress: text().notNull(),
    district: varchar({ length: 100 }).notNull(),
    city: varchar({ length: 100 }).default("TP. Hồ Chí Minh").notNull(),
    latitude: numeric({ precision: 10, scale: 8 }),
    longitude: numeric({ precision: 11, scale: 8 }),
    isDefault: boolean().default(false).notNull(),
  },
  (table) => [
    index("user_addresses_user_id_idx").on(table.userId),
    index("user_addresses_default_idx").on(table.userId, table.isDefault),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
export type UserAddress = typeof userAddresses.$inferSelect;
export type NewUserAddress = typeof userAddresses.$inferInsert;
