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
  MIN_ORDER_VALUE_VND: 150_000,
  FLASH_SALE_HOURS_THRESHOLD: 48,
  FLASH_SALE_DISCOUNT_PERCENT: 50,
  HARVEST_START_HOUR: 4,
  EXPRESS_DELIVERY_HOURS: 2,
  COMPLAINT_WINDOW_HOURS: 24,
  ORDER_PAYMENT_TIMEOUT_MINUTES: 15,
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
  FARM_COORDINATES: {
    NAME: "GreenRoots Farm",
    LATITUDE: 11.0067,
    LONGITUDE: 106.5132,
    ADDRESS: "Xã Nhuận Đức, Huyện Củ Chi, TP. Hồ Chí Minh",
  },
} as const;
