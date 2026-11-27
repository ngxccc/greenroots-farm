import { OrderStatus, PaymentMethod, UserRole } from "@greenroots/shared";

/** Canonical timezone for operational analytics date buckets and window bounds. */
export const ANALYTICS_TIMEZONE = "Asia/Ho_Chi_Minh";

/** Fixed UTC+07:00 offset in milliseconds for `Asia/Ho_Chi_Minh`. */
export const ANALYTICS_TIMEZONE_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Milliseconds in one UTC calendar day. */
export const ANALYTICS_DAY_MS = 24 * 60 * 60 * 1000;

/** Default inclusive day span when `from` and `to` are omitted. */
export const ANALYTICS_DEFAULT_RANGE_DAYS = 30;

/** Maximum inclusive day span permitted per query (`INV-5`). */
export const ANALYTICS_MAX_RANGE_DAYS = 365;

/** Default number of top-performing products returned. */
export const ANALYTICS_DEFAULT_TOP_LIMIT = 5;

/** Maximum number of top-performing products permitted per query (`INV-5`). */
export const ANALYTICS_MAX_TOP_LIMIT = 20;

/** Supported time-series aggregation granularities. */
export const ANALYTICS_GRANULARITIES = ["day", "week", "month"] as const;

/** Time-series aggregation granularity derived from `ANALYTICS_GRANULARITIES`. */
export type AnalyticsGranularity = (typeof ANALYTICS_GRANULARITIES)[number];

/** Order statuses recognized for operational gross item revenue (`INV-2`). */
export const ANALYTICS_REVENUE_ORDER_STATUSES = [
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
] as const;

/** Staff roles authorized to access operational analytics (`INV-1`). */
export const ANALYTICS_ALLOWED_ROLES = [
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
] as const;

/** Staff roles authorized to access financial cashflow analytics (`INV-6`). */
export const ANALYTICS_FINANCE_ALLOWED_ROLES = [UserRole.SUPER_ADMIN] as const;

/** Cash-bearing payment channels included in financial cashflow analytics (`INV-7`). */
export const ANALYTICS_FINANCE_PAYMENT_METHODS = [
  PaymentMethod.PAYOS,
  PaymentMethod.COD,
] as const;

/** Order statuses included in the live `pendingCodReceivableVnd` snapshot (`INV-9`). */
export const ANALYTICS_PENDING_COD_ORDER_STATUSES = [
  OrderStatus.SHIPPING,
  OrderStatus.DELIVERED,
] as const;
