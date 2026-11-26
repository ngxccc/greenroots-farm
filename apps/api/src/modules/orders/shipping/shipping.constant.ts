/**
 * NestJS dependency-injection token for the active `ShippingDriver` implementation.
 */
export const SHIPPING_DRIVER_TOKEN = Symbol("SHIPPING_DRIVER_TOKEN");

/**
 * Maximum upstream routing API wait time before falling back to Haversine (`INV-SHIP-1`).
 */
export const SHIPPING_ROUTE_TIMEOUT_MS = 3000;

/**
 * Redis TTL (24 hours) for cached road-distance lookups keyed by `farm_ver`.
 */
export const SHIPPING_ROUTE_CACHE_TTL_SECONDS = 86_400;
