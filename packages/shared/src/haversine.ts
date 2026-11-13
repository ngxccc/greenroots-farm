import { BUSINESS_RULES } from "./business.constants";

/**
 * Representative district/city center coordinate in Ho Chi Minh City used for
 * deterministic offline Haversine delivery fee estimation (Decision 17 / Q29).
 */
export interface HcmcDistrictCoordinate {
  readonly code: string;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * 24 administrative districts/cities of Ho Chi Minh City with center GPS coordinates.
 */
export const HCMC_DISTRICTS: readonly HcmcDistrictCoordinate[] = [
  { code: "quan-1", name: "Quận 1", latitude: 10.7769, longitude: 106.7009 },
  { code: "quan-3", name: "Quận 3", latitude: 10.7844, longitude: 106.6844 },
  { code: "quan-4", name: "Quận 4", latitude: 10.7578, longitude: 106.7013 },
  { code: "quan-5", name: "Quận 5", latitude: 10.754, longitude: 106.6634 },
  { code: "quan-6", name: "Quận 6", latitude: 10.7481, longitude: 106.6352 },
  { code: "quan-7", name: "Quận 7", latitude: 10.734, longitude: 106.7218 },
  { code: "quan-8", name: "Quận 8", latitude: 10.7241, longitude: 106.6286 },
  { code: "quan-10", name: "Quận 10", latitude: 10.7746, longitude: 106.6674 },
  { code: "quan-11", name: "Quận 11", latitude: 10.7629, longitude: 106.6501 },
  { code: "quan-12", name: "Quận 12", latitude: 10.8671, longitude: 106.6413 },
  {
    code: "binh-thanh",
    name: "Quận Bình Thạnh",
    latitude: 10.8106,
    longitude: 106.7091,
  },
  {
    code: "binh-tan",
    name: "Quận Bình Tân",
    latitude: 10.7652,
    longitude: 106.6038,
  },
  {
    code: "go-vap",
    name: "Quận Gò Vấp",
    latitude: 10.8387,
    longitude: 106.6653,
  },
  {
    code: "phu-nhuan",
    name: "Quận Phú Nhuận",
    latitude: 10.7992,
    longitude: 106.6803,
  },
  {
    code: "tan-binh",
    name: "Quận Tân Bình",
    latitude: 10.8015,
    longitude: 106.6526,
  },
  {
    code: "tan-phu",
    name: "Quận Tân Phú",
    latitude: 10.7901,
    longitude: 106.6281,
  },
  {
    code: "thu-duc",
    name: "TP. Thủ Đức",
    latitude: 10.8494,
    longitude: 106.7537,
  },
  {
    code: "cu-chi",
    name: "Huyện Củ Chi",
    latitude: 10.9734,
    longitude: 106.4938,
  },
  {
    code: "hoc-mon",
    name: "Huyện Hóc Môn",
    latitude: 10.8866,
    longitude: 106.5924,
  },
  {
    code: "binh-chanh",
    name: "Huyện Bình Chánh",
    latitude: 10.6874,
    longitude: 106.5939,
  },
  {
    code: "nha-be",
    name: "Huyện Nhà Bè",
    latitude: 10.6952,
    longitude: 106.7049,
  },
  {
    code: "can-gio",
    name: "Huyện Cần Giờ",
    latitude: 10.4114,
    longitude: 106.9547,
  },
  {
    code: "quan-2-old",
    name: "Khu vực Thảo Điền (Thủ Đức)",
    latitude: 10.8034,
    longitude: 106.7336,
  },
  {
    code: "quan-9-old",
    name: "Khu vực Công Nghệ Cao (Thủ Đức)",
    latitude: 10.8428,
    longitude: 106.8099,
  },
] as const;

export interface DeliveryQuote {
  readonly straightLineKm: number;
  readonly roadDistanceKm: number;
  readonly feeVnd: number;
  readonly isDeliverable: boolean;
}

const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;

/**
 * Calculates great-circle distance in kilometers between two WGS84 coordinates.
 */
export function calculateHaversineDistanceKm(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): number {
  const dLat = (destLat - originLat) * DEG_TO_RAD;
  const dLng = (destLng - originLng) * DEG_TO_RAD;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(originLat * DEG_TO_RAD) *
      Math.cos(destLat * DEG_TO_RAD) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((EARTH_RADIUS_KM * c).toFixed(2));
}

/**
 * Estimates road distance in kilometers using the urban detour factor (1.30).
 */
export function calculateRoadDistanceKm(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): number {
  const straightKm = calculateHaversineDistanceKm(
    originLat,
    originLng,
    destLat,
    destLng,
  );
  return Number(
    (straightKm * BUSINESS_RULES.SHIPPING.DETOUR_FACTOR).toFixed(2),
  );
}

/**
 * Estimates delivery fee in integer VND and checks radius eligibility from GreenRoots Farm.
 */
export function estimateDeliveryQuote(
  destLat: number,
  destLng: number,
  options: { isSubscription?: boolean } = {},
): DeliveryQuote {
  const { LATITUDE, LONGITUDE } = BUSINESS_RULES.FARM_COORDINATES;
  const {
    BASE_FEE_VND,
    FREE_KM_THRESHOLD,
    PER_KM_RATE_VND,
    MAX_RADIUS_KM,
    SUBSCRIPTION_FREE_RADIUS_KM,
  } = BUSINESS_RULES.SHIPPING;

  const straightLineKm = calculateHaversineDistanceKm(
    LATITUDE,
    LONGITUDE,
    destLat,
    destLng,
  );
  const roadDistanceKm = Number(
    (straightLineKm * BUSINESS_RULES.SHIPPING.DETOUR_FACTOR).toFixed(2),
  );

  if (options.isSubscription) {
    const isDeliverable = roadDistanceKm <= SUBSCRIPTION_FREE_RADIUS_KM;
    return {
      straightLineKm,
      roadDistanceKm,
      feeVnd: 0,
      isDeliverable,
    };
  }

  const isDeliverable = roadDistanceKm <= MAX_RADIUS_KM;
  const extraKm = Math.max(0, Math.ceil(roadDistanceKm - FREE_KM_THRESHOLD));
  const feeVnd = BASE_FEE_VND + extraKm * PER_KM_RATE_VND;

  return {
    straightLineKm,
    roadDistanceKm,
    feeVnd,
    isDeliverable,
  };
}
