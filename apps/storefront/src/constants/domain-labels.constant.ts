import {
  BatchStatus,
  DELIVERY_DAY_LABELS,
  FarmingActionType,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  SeasonStatus,
} from "@greenroots/shared";
import { FARM_METADATA } from "./farm-metadata.constant";

export { DELIVERY_DAY_LABELS, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS };

/**
 * Customer-facing Vietnamese labels for Storefront surfaces (Q25 / Q2-B).
 * Operational Backoffice surfaces define their own staff-facing batch labels.
 */
export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  [BatchStatus.IN_STOCK]: "Tươi mới - Đang bán",
  [BatchStatus.NEAR_EXPIRY]: `Cận hạn - Giải cứu ${FARM_METADATA.flashSaleDiscountPercent}%`,
  [BatchStatus.SOLD_OUT]: "Đã hết hàng",
  [BatchStatus.EXPIRED]: "Đã hết hạn",
};

export const FARMING_ACTION_LABELS: Record<FarmingActionType, string> = {
  [FarmingActionType.SEEDING]: "Gieo hạt / Xuống giống",
  [FarmingActionType.WATERING]: "Tưới nước sạch",
  [FarmingActionType.BIO_FERTILIZING]: "Bón phân hữu cơ vi sinh",
  [FarmingActionType.WEEDING]: "Làm cỏ thủ công",
  [FarmingActionType.PEST_CONTROL]: "Phòng trừ sâu sinh học",
  [FarmingActionType.SOIL_TESTING]: "Kiểm định mẫu đất",
  [FarmingActionType.HARVESTING]: `Thu hoạch lúc ${FARM_METADATA.harvestTimeLabel}`,
  [FarmingActionType.CORRECTION]: "Ghi chú đính chính",
};

export const SEASON_STATUS_LABELS: Record<SeasonStatus, string> = {
  [SeasonStatus.PLANNING]: "Đang lập kế hoạch",
  [SeasonStatus.ACTIVE]: "Đang canh tác",
  [SeasonStatus.HARVESTED]: "Đã thu hoạch",
  [SeasonStatus.COMPLETED]: "Hoàn tất mùa vụ",
};
