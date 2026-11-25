import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  snakeCase,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  BUSINESS_RULES,
  type StaffAuditSnapshot,
  UserRole,
  UserStatus,
} from "@greenroots/shared";
import {
  authSurfaceEnum,
  staffAuditActionEnum,
  userRoleEnum,
  userStatusEnum,
} from "./enums.schema";
import { baseEntity, primaryKeyUuid, softDeleteEntity } from "./helpers.schema";

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
    check("users_reward_points_non_negative", sql`${table.rewardPoints} >= 0`),
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
    surface: authSurfaceEnum().notNull(),
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
    districtCode: varchar({ length: 50 }).notNull(),
    district: varchar({ length: 100 }).notNull(),
    city: varchar({ length: 100 })
      .default(BUSINESS_RULES.DEFAULT_DELIVERY_CITY)
      .notNull(),
    latitude: numeric({ precision: 10, scale: 8 }),
    longitude: numeric({ precision: 11, scale: 8 }),
    isDefault: boolean().default(false).notNull(),
  },
  (table) => [
    index("user_addresses_user_id_idx").on(table.userId),
    uniqueIndex("user_addresses_default_uidx")
      .on(table.userId)
      .where(sql`${table.isDefault} = true`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
export type UserAddress = typeof userAddresses.$inferSelect;
export type NewUserAddress = typeof userAddresses.$inferInsert;

export const staffAuditLogs = snakeCase.table(
  "staff_audit_logs",
  {
    ...primaryKeyUuid,
    actorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    targetUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: staffAuditActionEnum().notNull(),
    before: jsonb().$type<StaffAuditSnapshot | null>(),
    after: jsonb().$type<StaffAuditSnapshot | null>(),
    createdAt: timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("staff_audit_logs_target_created_idx").on(
      table.targetUserId,
      table.createdAt,
    ),
    index("staff_audit_logs_actor_created_idx").on(
      table.actorId,
      table.createdAt,
    ),
  ],
);

export type StaffAuditLog = typeof staffAuditLogs.$inferSelect;
export type NewStaffAuditLog = typeof staffAuditLogs.$inferInsert;
