import { UserRole } from "./domain.enums";

/**
 * GreenRoots Farm - Business and Operational Constants
 */

/**
 * Canonical list of internal staff roles managed via `/api/v1/admin/users`.
 */
export const STAFF_ROLES = [
  UserRole.FARM_STAFF,
  UserRole.SALES,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
] as const;

/**
 * Union of internal staff roles excluding `customer` and `guest`.
 */
export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * Returns true when the given role belongs to the internal staff directory boundary.
 *
 * @param role User role to check.
 * @returns True if `role` is in `STAFF_ROLES`.
 */
export function isStaffRole(role: UserRole): role is StaffRole {
  return (STAFF_ROLES as readonly UserRole[]).includes(role);
}

export const BUSINESS_RULES = {
  CURRENCY: "VND",
  MIN_ORDER_VALUE_VND: 50_000,
  ORDER_ITEM_MIN_QUANTITY: 0.01,
  FLASH_SALE_HOURS_THRESHOLD: 48,
  FLASH_SALE_DISCOUNT_PERCENT: 50,
  HARVEST_START_HOUR: 15,
  HUB_ARRIVAL_HOUR: 4,
  EXPRESS_DELIVERY_HOURS: 2,
  COMPLAINT_WINDOW_HOURS: 24,
  COMPLAINT_MIN_IMAGES: 1,
  COMPLAINT_MAX_IMAGES: 5,
  COMPLAINT_VIDEO_MAX_SECONDS: 15,
  ORDER_PAYMENT_TIMEOUT_MINUTES: 15,
  COD_CONFIRMATION_TIMEOUT_MINUTES: 120,
  MAX_PENDING_COD_ORDERS_PER_CUSTOMER: 3,
  LOYALTY_POINT_CONVERSION_PERCENT: 1, // 1% points earned on delivered order
  MAX_USER_ADDRESSES: 10,
  DEFAULT_DELIVERY_CITY: "TP. Hồ Chí Minh",
  SUBSCRIPTION_DELIVERY_DAYS: ["tuesday", "friday"] as const,
  SHIPPING: {
    BASE_FEE_VND: 15000,
    FREE_KM_THRESHOLD: 3,
    PER_KM_RATE_VND: 5000,
    DETOUR_FACTOR: 1.3,
    MAX_RADIUS_KM: 25,
    SUBSCRIPTION_FREE_RADIUS_KM: 20,
  },
  FULFILLMENT_HUB: {
    NAME: "GreenRoots Urban Hub — Bình Thạnh",
    LATITUDE: 10.8106,
    LONGITUDE: 106.7091,
    ADDRESS: "Phường 25, Quận Bình Thạnh, TP. Hồ Chí Minh",
  },
  FARM_ORIGIN: {
    BRAND_NAME: "GreenRoots Farm",
    BRAND_ORIGIN: "Đà Lạt",
    ADDRESS: "Xã Lạc Xuân, Huyện Đơn Dương, Tỉnh Lâm Đồng",
  },
} as const;
