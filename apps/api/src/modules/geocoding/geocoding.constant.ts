import type { ResolvedPlace } from "./geocoding.interface";

/**
 * NestJS DI token for the active `GeocodingDriver` implementation.
 */
export const GEOCODING_DRIVER_TOKEN = Symbol("GEOCODING_DRIVER_TOKEN");

/**
 * Upstream HTTP timeout for Goong/Vietmap Place API requests in milliseconds.
 */
export const GEOCODING_TIMEOUT_MS = 3_000;

/**
 * Redis TTL (24 hours) for cached autocomplete suggestions.
 */
export const GEOCODING_AUTOCOMPLETE_TTL_SECONDS = 24 * 60 * 60;

/**
 * Redis TTL (14 days) for cached place detail coordinate resolutions.
 */
export const GEOCODING_PLACE_TTL_SECONDS = 14 * 24 * 60 * 60;

/**
 * Redis key prefix for autocomplete query caching.
 */
export const GEOCODING_AUTOCOMPLETE_CACHE_PREFIX = "geo:ac:";

/**
 * Redis key prefix for resolved place detail caching.
 */
export const GEOCODING_PLACE_CACHE_PREFIX = "geo:place:";

/**
 * Strict rate-limit parameters for customer autocomplete requests (30 req / 60s).
 */
export const GEOCODING_AUTOCOMPLETE_THROTTLE_LIMIT = 30;
export const GEOCODING_AUTOCOMPLETE_THROTTLE_TTL_MS = 60_000;

/**
 * Deterministic Ho Chi Minh City (and out-of-radius test) place fixtures for `GEOCODING_DRIVER=mock`.
 */
export const MOCK_PLACES: readonly ResolvedPlace[] = [
  {
    placeId: "mock_place_quan_1",
    latitude: 10.7769,
    longitude: 106.7009,
    ward: "Phường Sài Gòn",
    formattedAddress: "15 Lê Lợi, Phường Sài Gòn, TP. Hồ Chí Minh",
  },
  {
    placeId: "mock_place_quan_7",
    latitude: 10.734,
    longitude: 106.7218,
    ward: "Phường Tân Phú",
    formattedAddress: "12 Nguyễn Văn Linh, Phường Tân Phú, TP. Hồ Chí Minh",
  },
  {
    placeId: "mock_place_binh_thanh",
    latitude: 10.8106,
    longitude: 106.7091,
    ward: "Phường Bình Thạnh",
    formattedAddress:
      "215 Xô Viết Nghệ Tĩnh, Phường Bình Thạnh, TP. Hồ Chí Minh",
  },
  {
    placeId: "mock_place_go_vap",
    latitude: 10.8387,
    longitude: 106.6653,
    ward: "Phường Gò Vấp",
    formattedAddress: "142 Lê Đức Thọ, Phường Gò Vấp, TP. Hồ Chí Minh",
  },
  {
    placeId: "mock_place_thu_duc",
    latitude: 10.8494,
    longitude: 106.7537,
    ward: "Phường Thủ Đức",
    formattedAddress: "240 Võ Văn Ngân, Phường Thủ Đức, TP. Hồ Chí Minh",
  },
  {
    placeId: "mock_place_hoc_mon",
    latitude: 10.8866,
    longitude: 106.5924,
    ward: "Xã Hóc Môn",
    formattedAddress: "65 Lý Thường Kiệt, Xã Hóc Môn, TP. Hồ Chí Minh",
  },
  {
    placeId: "mock_place_binh_chanh",
    latitude: 10.6874,
    longitude: 106.5939,
    ward: "Xã Tân Nhựt",
    formattedAddress: "18 Quốc lộ 1A, Xã Tân Nhựt, TP. Hồ Chí Minh",
  },
  {
    placeId: "mock_place_can_gio",
    latitude: 10.4114,
    longitude: 106.9547,
    ward: "Xã Cần Giờ",
    formattedAddress: "10 Duyên Hải, Xã Cần Giờ, TP. Hồ Chí Minh",
  },
  {
    placeId: "mock_place_hanoi",
    latitude: 21.0285,
    longitude: 105.8542,
    ward: "Phường Hoàn Kiếm",
    formattedAddress: "1 Tràng Tiền, Phường Hoàn Kiếm, Hà Nội",
  },
] as const;
