import { BUSINESS_RULES } from "@greenroots/shared";

const harvestTimeLabel = `${BUSINESS_RULES.HARVEST_START_HOUR}h sáng`;
const expressDeliveryLabel = `${BUSINESS_RULES.EXPRESS_DELIVERY_HOURS}h`;

/**
 * Single source of truth for GreenRoots Farm storefront branding and policy copy.
 */
export const FARM_METADATA = {
  brandName: BUSINESS_RULES.FARM_COORDINATES.NAME,
  locationShort: "Củ Chi, TP.HCM",
  fullAddress: BUSINESS_RULES.FARM_COORDINATES.ADDRESS,
  hotline: "1900 6868",
  email: "chamsoc@greenroots.farm",
  certifications: ["VietGAP", "USDA Organic"] as const,
  certificationCode: "VG-HCM-2026-0089",
  harvestTimeLabel,
  expressDeliveryLabel,
  complaintWindowHours: BUSINESS_RULES.COMPLAINT_WINDOW_HOURS,
  maxDeliveryRadiusKm: BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM,
  flashSaleDiscountPercent: BUSINESS_RULES.FLASH_SALE_DISCOUNT_PERCENT,
  flashSaleHoursThreshold: BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD,
  rescueNote: `Thu hoạch đạt chuẩn, tiêu thụ trong ngày, giảm ${BUSINESS_RULES.FLASH_SALE_DISCOUNT_PERCENT}% khi cận hạn thay vì bỏ đi.`,
} as const;
