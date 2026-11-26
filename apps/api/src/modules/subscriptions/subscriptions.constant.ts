/**
 * Strict lowercase kebab-case slug format (`goi-rau-gia-dinh-1-thang`).
 */
export const SUBSCRIPTION_PLAN_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Maximum length for subscription plan descriptions and basket descriptions.
 */
export const MAX_SUBSCRIPTION_PLAN_DESCRIPTION_LENGTH = 5000;

/**
 * Minimum allowed weight per delivery in kg (`numeric(5, 2)` positive lower bound).
 */
export const MIN_SUBSCRIPTION_PLAN_WEIGHT_KG = 0.01;

/**
 * Maximum allowed weight per delivery in kg (`numeric(5, 2)` upper bound).
 */
export const MAX_SUBSCRIPTION_PLAN_WEIGHT_KG = 999.99;

/**
 * Partial unique index name enforcing active subscription plan slug uniqueness.
 */
export const SUBSCRIPTION_PLANS_SLUG_UIDX = "subscription_plans_slug_uidx";

export const SUBSCRIPTION_CODE_PREFIX = "SUB";
export const SUBSCRIPTION_CODE_RANDOM_LENGTH = 6;
export const SUBSCRIPTION_CODE_MAX_GENERATION_ATTEMPTS = 5;
export const CROCKFORD_BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const SUBSCRIPTION_CODE_UIDX = "subscriptions_subscription_code_uidx";
