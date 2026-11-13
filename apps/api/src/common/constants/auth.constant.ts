/**
 * Authentication and Redis revocation constants.
 */
export const AUTH_REVOCATION_KEY_PREFIX = "auth:revoked:";

/** Instant access-token revocation window (15 minutes). */
export const AUTH_REVOCATION_TTL_SECONDS = 15 * 60;

/** Refresh tokens are opaque 256-bit random values encoded as 64 hex characters. */
export const REFRESH_TOKEN_BYTES = 32;

/** Password hash version tag used by the scrypt `s1$<salt>$<hash>` format. */
export const PASSWORD_HASH_VERSION = "s1";
