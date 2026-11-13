import { describe, expect, test } from "bun:test";
import {
  BatchStatus,
  ComplaintResolution,
  ComplaintStatus,
  DeliveryDay,
  FarmingActionType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  SeasonStatus,
  SubscriptionStatus,
  UserRole,
  UserStatus,
  WasteLogStatus,
} from "./domain.enums";

/**
 * SSOT guard: every enum value must match Database_Schema.dbml exactly.
 */
describe("domain enums match Database_Schema.dbml", () => {
  test("user and season enums", () => {
    expect(Object.values(UserRole)).toEqual([
      "guest",
      "customer",
      "farm_staff",
      "sales",
      "admin",
      "super_admin",
    ]);
    expect(Object.values(UserStatus)).toEqual([
      "active",
      "inactive",
      "suspended",
    ]);
    expect(Object.values(SeasonStatus)).toEqual([
      "planning",
      "active",
      "harvested",
      "completed",
    ]);
  });

  test("farming and inventory enums", () => {
    expect(Object.values(FarmingActionType)).toEqual([
      "seeding",
      "watering",
      "bio_fertilizing",
      "weeding",
      "pest_control",
      "soil_testing",
      "harvesting",
      "correction",
    ]);
    expect(Object.values(BatchStatus)).toEqual([
      "in_stock",
      "near_expiry",
      "sold_out",
      "expired",
    ]);
    expect(Object.values(WasteLogStatus)).toEqual([
      "pending_approval",
      "approved",
      "rejected",
    ]);
  });

  test("order, payment and subscription enums", () => {
    expect(Object.values(OrderStatus)).toEqual([
      "pending_payment",
      "pending_confirmation",
      "packing",
      "shipping",
      "delivered",
      "completed",
      "cancelled",
    ]);
    expect(Object.values(PaymentMethod)).toEqual([
      "cod",
      "payos",
      "subscription",
    ]);
    expect(Object.values(PaymentStatus)).toEqual([
      "pending",
      "paid",
      "failed",
      "refunded",
    ]);
    expect(Object.values(PaymentTransactionType)).toEqual([
      "payment",
      "refund",
    ]);
    expect(Object.values(DeliveryDay)).toEqual(["tuesday", "friday", "both"]);
    expect(Object.values(SubscriptionStatus)).toEqual([
      "active",
      "paused",
      "completed",
      "cancelled",
    ]);
  });

  test("complaint enums", () => {
    expect(Object.values(ComplaintStatus)).toEqual([
      "pending",
      "approved",
      "rejected",
    ]);
    expect(Object.values(ComplaintResolution)).toEqual([
      "refund",
      "replacement",
    ]);
  });
});
