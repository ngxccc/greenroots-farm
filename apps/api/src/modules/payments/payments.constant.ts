/**
 * NestJS dependency-injection token for the active `PaymentDriver` implementation.
 */
export const PAYMENT_DRIVER_TOKEN = Symbol("PAYMENT_DRIVER_TOKEN");

/**
 * Base URL for PayOS v2 Merchant API requests.
 */
export const PAYOS_API_BASE_URL = "https://api-merchant.payos.vn";

/**
 * Maximum outbound HTTP request duration in milliseconds for PayOS API calls.
 */
export const PAYOS_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Maximum character length enforced by PayOS for payment link descriptions.
 */
export const PAYOS_DESCRIPTION_MAX_LENGTH = 25;

/**
 * Partial unique index name enforcing PayOS numeric `order_code` uniqueness.
 */
export const PAYMENT_ORDER_CODE_UIDX = "payments_order_code_uidx";
