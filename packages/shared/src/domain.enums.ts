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

export const AuthSurface = {
  CUSTOMER: "customer",
  STAFF: "staff",
} as const;
export type AuthSurface = (typeof AuthSurface)[keyof typeof AuthSurface];

/**
 * Enumeration of auditable administrative actions persisted in `staff_audit_logs`.
 */
export const StaffAuditAction = {
  CREATE: "staff.create",
  UPDATE_PROFILE: "staff.update_profile",
  CHANGE_ROLE: "staff.change_role",
  CHANGE_STATUS: "staff.change_status",
  UPDATE: "staff.update",
  RESET_CREDENTIALS: "staff.reset_credentials",
} as const;
export type StaffAuditAction =
  (typeof StaffAuditAction)[keyof typeof StaffAuditAction];

export const SeasonStatus = {
  PLANNING: "planning",
  ACTIVE: "active",
  HARVESTED: "harvested",
  COMPLETED: "completed",
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
  PENDING_CONFIRMATION: "pending_confirmation",
  CONFIRMED: "confirmed",
  PACKING: "packing",
  SHIPPING: "shipping",
  DELIVERED: "delivered",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentMethod = {
  COD: "cod",
  PAYOS: "payos",
  SUBSCRIPTION: "subscription",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentTransactionType = {
  PAYMENT: "payment",
  REFUND: "refund",
} as const;
export type PaymentTransactionType =
  (typeof PaymentTransactionType)[keyof typeof PaymentTransactionType];

export const DeliveryDay = {
  TUESDAY: "tuesday",
  FRIDAY: "friday",
  BOTH: "both",
} as const;
export type DeliveryDay = (typeof DeliveryDay)[keyof typeof DeliveryDay];

export const SubscriptionStatus = {
  PENDING_PAYMENT: "pending_payment",
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;
export type SubscriptionStatus =
  (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const ComplaintStatus = {
  PENDING: "pending",
  TRIAGED: "triaged",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;
export type ComplaintStatus =
  (typeof ComplaintStatus)[keyof typeof ComplaintStatus];

export const ComplaintResolution = {
  REFUND: "refund",
  REPLACEMENT: "replacement",
} as const;
export type ComplaintResolution =
  (typeof ComplaintResolution)[keyof typeof ComplaintResolution];

export const WasteLogStatus = {
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;
export type WasteLogStatus =
  (typeof WasteLogStatus)[keyof typeof WasteLogStatus];
