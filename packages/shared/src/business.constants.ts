/**
 * GreenRoots Farm - Business and Operational Constants
 */

export const BUSINESS_RULES = {
  CURRENCY: "VND",
  FLASH_SALE_HOURS_THRESHOLD: 48,
  FLASH_SALE_DISCOUNT_PERCENT: 50,
  HARVEST_START_HOUR: 4,
  EXPRESS_DELIVERY_HOURS: 2,
  COMPLAINT_WINDOW_HOURS: 24,
  ORDER_PAYMENT_TIMEOUT_MINUTES: 15,
  LOYALTY_POINT_CONVERSION_PERCENT: 1, // 1% points earned on delivered order
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
