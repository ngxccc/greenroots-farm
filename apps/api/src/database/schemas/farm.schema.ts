import {
  boolean,
  date,
  index,
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
import type {
  FarmBankInfo,
  FarmEmails,
  FarmFlashSaleConfig,
  FarmHotlines,
  FarmShippingConfig,
  FarmWorkingHours,
  FarmingLogMediaUrls,
  SoilTestResult,
  WaterTestResult,
} from "@greenroots/shared";
import { SeasonStatus } from "@greenroots/shared";
import { baseEntity, primaryKeyUuid, softDeleteEntity } from "./helpers.schema";
import { seasonStatusEnum, farmingActionTypeEnum } from "./enums.schema";
import { users } from "./user.schema";

export const farms = snakeCase.table("farms", {
  ...baseEntity,
  name: varchar({ length: 255 }).default("GreenRoots Farm").notNull(),
  legalName: varchar({ length: 255 })
    .default("Công ty TNHH Nông nghiệp Hữu cơ GreenRoots")
    .notNull(),
  tagline: varchar({ length: 255 }),
  taxId: varchar({ length: 50 }),
  address: text().notNull(),
  latitude: numeric({ precision: 10, scale: 8 }).notNull(),
  longitude: numeric({ precision: 11, scale: 8 }).notNull(),
  certificationUrl: text(),
  hotlines: jsonb().$type<FarmHotlines>().notNull(),
  emails: jsonb().$type<FarmEmails>().notNull(),
  workingHours: jsonb().$type<FarmWorkingHours>().notNull(),
  bankInfo: jsonb().$type<FarmBankInfo>(),
  shippingConfig: jsonb().$type<FarmShippingConfig>().notNull(),
  flashSaleConfig: jsonb().$type<FarmFlashSaleConfig>().notNull(),
  isPayosEnabled: boolean().default(true).notNull(),
  isCodEnabled: boolean().default(true).notNull(),
});

export const plots = snakeCase.table(
  "plots",
  {
    ...softDeleteEntity,
    farmId: uuid()
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    plotCode: varchar({ length: 50 }).notNull(),
    name: varchar({ length: 255 }).notNull(),
    areaSqm: numeric({ precision: 10, scale: 2 }).notNull(),
    soilTestResult: jsonb().$type<SoilTestResult>(),
    waterTestResult: jsonb().$type<WaterTestResult>(),
  },
  (table) => [
    index("plots_farm_id_idx").on(table.farmId),
    uniqueIndex("plots_plot_code_uidx")
      .on(table.plotCode)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const seasons = snakeCase.table(
  "seasons",
  {
    ...baseEntity,
    plotId: uuid()
      .notNull()
      .references(() => plots.id, { onDelete: "restrict" }),
    seasonName: varchar({ length: 255 }).notNull(),
    startDate: date().notNull(),
    expectedHarvestDate: date().notNull(),
    status: seasonStatusEnum().default(SeasonStatus.PLANNING).notNull(),
  },
  (table) => [
    index("seasons_plot_id_idx").on(table.plotId),
    index("seasons_status_idx").on(table.status),
  ],
);

export const farmingLogs = snakeCase.table(
  "farming_logs",
  {
    ...primaryKeyUuid,
    seasonId: uuid()
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    staffId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    actionType: farmingActionTypeEnum().notNull(),
    description: text().notNull(),
    mediaUrls: jsonb().$type<FarmingLogMediaUrls>(),
    loggedAt: timestamp({ withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("farming_logs_season_id_logged_at_idx").on(
      table.seasonId,
      table.loggedAt,
    ),
    index("farming_logs_staff_id_idx").on(table.staffId),
  ],
);

export type Farm = typeof farms.$inferSelect;
export type NewFarm = typeof farms.$inferInsert;
export type Plot = typeof plots.$inferSelect;
export type NewPlot = typeof plots.$inferInsert;
export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
export type FarmingLog = typeof farmingLogs.$inferSelect;
export type NewFarmingLog = typeof farmingLogs.$inferInsert;
