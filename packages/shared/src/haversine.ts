import { BUSINESS_RULES } from "./business.constants";
import type { FarmShippingConfig } from "./jsonb-contracts.type";

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

/**
 * WGS84 geographic coordinate pair in decimal degrees.
 */
export interface GeoCoordinate {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * Shipping pricing and delivery radius rules evaluated by {@link calculateDeliveryQuote}.
 */
export type ShippingQuoteConfig = FarmShippingConfig;

/**
 * Optional delivery-context flags modifying shipping quote eligibility or fee calculation.
 */
export interface DeliveryQuoteOptions {
  readonly isSubscription?: boolean;
}

/**
 * Result of {@link calculateDeliveryQuote}: carries an integer VND fee when deliverable,
 * or `feeVnd: null` when `roadDistanceKm` exceeds the farm's maximum delivery radius.
 */
export type DeliveryQuote =
  | {
      readonly straightLineKm: number;
      readonly roadDistanceKm: number;
      readonly feeVnd: number;
      readonly isDeliverable: true;
      readonly isFreeShipping: boolean;
    }
  | {
      readonly straightLineKm: number;
      readonly roadDistanceKm: number;
      readonly feeVnd: null;
      readonly isDeliverable: false;
      readonly isFreeShipping: false;
    };

/**
 * Resolves a Ho Chi Minh City district entry by its canonical code.
 *
 * @param code Canonical district code from `HCMC_DISTRICTS`.
 * @returns Matching district coordinate entry, or `undefined` when unknown.
 */
export function findHcmcDistrictByCode(
  code: string,
): HcmcDistrictCoordinate | undefined {
  return HCMC_DISTRICTS.find((district) => district.code === code);
}

const EARTH_RADIUS_KM = 6371;
const DEG_TO_RAD = Math.PI / 180;

/**
 * Calculates great-circle distance in kilometers between two WGS84 coordinates,
 * rounded to two decimal places.
 *
 * @param originLat Origin latitude in decimal degrees.
 * @param originLng Origin longitude in decimal degrees.
 * @param destLat Destination latitude in decimal degrees.
 * @param destLng Destination longitude in decimal degrees.
 * @returns Great-circle distance in kilometers rounded to 2 decimal places.
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
 * Estimates road distance in kilometers using the configured detour factor (defaults to 1.30).
 *
 * @param originLat Origin latitude in decimal degrees.
 * @param originLng Origin longitude in decimal degrees.
 * @param destLat Destination latitude in decimal degrees.
 * @param destLng Destination longitude in decimal degrees.
 * @param detourFactor Multiplicative urban road detour factor.
 * @returns Estimated road distance in kilometers rounded to 2 decimal places.
 */
export function calculateRoadDistanceKm(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  detourFactor: number = BUSINESS_RULES.SHIPPING.DETOUR_FACTOR,
): number {
  const straightKm = calculateHaversineDistanceKm(
    originLat,
    originLng,
    destLat,
    destLng,
  );
  return Number((straightKm * detourFactor).toFixed(2));
}

/**
 * Calculates a delivery quote in integer VND and checks radius eligibility
 * using explicit origin coordinates and shipping configuration.
 *
 * @param origin Farm origin coordinates.
 * @param destination Customer or district centroid coordinates.
 * @param config Active shipping pricing and radius thresholds.
 * @param options Delivery quote options such as `isSubscription`.
 * @returns Delivery quote with integer VND fee when deliverable or `feeVnd: null` otherwise.
 */
export function calculateDeliveryQuote(
  origin: GeoCoordinate,
  destination: GeoCoordinate,
  config: ShippingQuoteConfig,
  options: DeliveryQuoteOptions = {},
): DeliveryQuote {
  const maxRadiusKm =
    config.maxRadiusKm ?? BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM;
  const subscriptionFreeRadiusKm =
    config.subscriptionFreeRadiusKm ??
    BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM;

  const straightLineKm = calculateHaversineDistanceKm(
    origin.latitude,
    origin.longitude,
    destination.latitude,
    destination.longitude,
  );
  // Keep two-step rounding matching calculateRoadDistanceKm so shared preview and API quotes never diverge.
  const roadDistanceKm = Number(
    (straightLineKm * config.detourFactor).toFixed(2),
  );

  // Enforce maxRadiusKm before subscription free-tier rules so misconfigured settings cannot exceed max radius.
  if (roadDistanceKm > maxRadiusKm) {
    return {
      straightLineKm,
      roadDistanceKm,
      feeVnd: null,
      isDeliverable: false,
      isFreeShipping: false,
    };
  }

  if (options.isSubscription && roadDistanceKm <= subscriptionFreeRadiusKm) {
    return {
      straightLineKm,
      roadDistanceKm,
      feeVnd: 0,
      isDeliverable: true,
      isFreeShipping: true,
    };
  }

  const extraKm = Math.max(
    0,
    Math.ceil(roadDistanceKm - config.freeKmThreshold),
  );
  const feeVnd = config.baseFeeVnd + extraKm * config.perKmRateVnd;

  return {
    straightLineKm,
    roadDistanceKm,
    feeVnd,
    isDeliverable: true,
    isFreeShipping: feeVnd === 0,
  };
}
