/**
 * GreenRoots Farm - 100% SSOT Enums matching Database_Schema.dbml
 */

export const UserRole = {
  GUEST: "guest",
  CUSTOMER: "customer",
  FARM_STAFF: "farm_staff",
  SALES: "sales",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  SUSPENDED: "suspended",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const SeasonStatus = {
  PLANNING: "planning",
  ACTIVE: "active",
  HARVESTED: "harvested",
  ARCHIVED: "archived",
} as const;
export type SeasonStatus = (typeof SeasonStatus)[keyof typeof SeasonStatus];

export const FarmingActionType = {
  SEEDING: "seeding",
  WATERING: "watering",
  BIO_FERTILIZING: "bio_fertilizing",
  WEEDING: "weeding",
  PEST_CONTROL: "pest_control",
  SOIL_TESTING: "soil_testing",
  HARVESTING: "harvesting",
  CORRECTION: "correction",
} as const;
export type FarmingActionType =
  (typeof FarmingActionType)[keyof typeof FarmingActionType];

export const BatchStatus = {
  IN_STOCK: "in_stock",
  NEAR_EXPIRY: "near_expiry",
  SOLD_OUT: "sold_out",
  EXPIRED: "expired",
} as const;
export type BatchStatus = (typeof BatchStatus)[keyof typeof BatchStatus];

export const OrderStatus = {
  PENDING_PAYMENT: "pending_payment",
  PAID: "paid",
  CONFIRMED: "confirmed",
  PACKING: "packing",
  SHIPPING: "shipping",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentMethod = {
  COD: "cod",
  PAYOS: "payos",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: "pending",
  PAID: "paid",
  REFUNDED: "refunded",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentTransactionType = {
  PAYMENT: "payment",
  REFUND: "refund",
} as const;
export type PaymentTransactionType =
  (typeof PaymentTransactionType)[keyof typeof PaymentTransactionType];

export const EnumDeliveryDay = {
  TUESDAY: "tuesday",
  FRIDAY: "friday",
  BOTH: "both",
} as const;
export type EnumDeliveryDay =
  (typeof EnumDeliveryDay)[keyof typeof EnumDeliveryDay];

export const SubscriptionStatus = {
  ACTIVE: "active",
  PAUSED: "paused",
  CANCELLED: "cancelled",
} as const;
export type SubscriptionStatus =
  (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const WasteLogStatus = {
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;
export type WasteLogStatus =
  (typeof WasteLogStatus)[keyof typeof WasteLogStatus];

export const ComplaintStatus = {
  PENDING: "pending",
  RESOLVED: "resolved",
  REJECTED: "rejected",
} as const;
export type ComplaintStatus =
  (typeof ComplaintStatus)[keyof typeof ComplaintStatus];
