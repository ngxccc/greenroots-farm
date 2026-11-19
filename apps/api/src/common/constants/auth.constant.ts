import {
  daysToMs,
  daysToSeconds,
  minutesToMs,
  minutesToSeconds,
  secondsToMs,
} from "@/common/utils/time.util";

/**
 * Authentication, token lifecycle, and Redis revocation constants.
 */

// Two-tier Redis session revocation key prefixes
export const AUTH_REVOCATION_KEY_PREFIX = "auth:revoked:";
export const AUTH_REVOCATION_USER_PREFIX = `${AUTH_REVOCATION_KEY_PREFIX}user:`;
export const AUTH_REVOCATION_TOKEN_PREFIX = `${AUTH_REVOCATION_KEY_PREFIX}token:`;

// Spec aliases for consistency across explorer handoffs
export const AUTH_REVOKED_USER_PREFIX = AUTH_REVOCATION_USER_PREFIX;
export const AUTH_REVOKED_TOKEN_PREFIX = AUTH_REVOCATION_TOKEN_PREFIX;

// Token and Session Expiration Windows (Seconds & Milliseconds)
/** Access token validity window: 15 minutes (900 seconds). */
export const ACCESS_TOKEN_TTL_SECONDS = minutesToSeconds(15);
export const ACCESS_TOKEN_TTL_MS = minutesToMs(15);
export const AUTH_ACCESS_TOKEN_TTL_SECONDS = ACCESS_TOKEN_TTL_SECONDS;

/** Refresh token validity window: 7 days (604,800 seconds). */
export const REFRESH_TOKEN_TTL_SECONDS = daysToSeconds(7);
export const REFRESH_TOKEN_TTL_MS = daysToMs(7);
export const AUTH_REFRESH_TOKEN_TTL_SECONDS = REFRESH_TOKEN_TTL_SECONDS;

/** Account-wide revocation blacklist TTL in Redis: 15 minutes (900 seconds). */
export const AUTH_REVOCATION_TTL_SECONDS = minutesToSeconds(15);
export const AUTH_REVOCATION_TTL_MS = minutesToMs(15);

/** Email verification token validity window: 24 hours (86,400 seconds). */
export const VERIFICATION_TOKEN_TTL_SECONDS = daysToSeconds(1);
export const VERIFICATION_TOKEN_TTL_MS = daysToMs(1);
export const AUTH_VERIFICATION_TOKEN_TTL_SECONDS =
  VERIFICATION_TOKEN_TTL_SECONDS;

/** Password reset token validity window: 15 minutes (900 seconds). */
export const RESET_PASSWORD_TOKEN_TTL_SECONDS = minutesToSeconds(15);
export const RESET_PASSWORD_TOKEN_TTL_MS = minutesToMs(15);
export const RESET_TOKEN_TTL_SECONDS = RESET_PASSWORD_TOKEN_TTL_SECONDS;
export const RESET_TOKEN_TTL_MS = RESET_PASSWORD_TOKEN_TTL_MS;
export const AUTH_RESET_TOKEN_TTL_SECONDS = RESET_PASSWORD_TOKEN_TTL_SECONDS;

/** Staff invitation and admin credential reset token validity window: 24 hours (86,400 seconds). */
export const STAFF_INVITE_TOKEN_TTL_SECONDS = daysToSeconds(1);
export const STAFF_INVITE_TOKEN_TTL_MS = daysToMs(1);

/** Anti-enumeration resend verification cooldown: 60 seconds (60,000 ms). */
export const RESEND_VERIFICATION_COOLDOWN_SECONDS = 60;
export const RESEND_VERIFICATION_COOLDOWN_MS = secondsToMs(60);
export const VERIFICATION_RESEND_COOLDOWN_SECONDS =
  RESEND_VERIFICATION_COOLDOWN_SECONDS;
export const AUTH_RESEND_COOLDOWN_SECONDS =
  RESEND_VERIFICATION_COOLDOWN_SECONDS;

/** Background token cleanup cron interval: 24 hours (86,400,000 ms). */
export const TOKEN_CLEANUP_INTERVAL_MS = daysToMs(1);

/** Circuit breaker degraded cooldown: 30 seconds (30,000 ms). */
export const REDIS_DEGRADED_COOLDOWN_MS = secondsToMs(30);

// Token Entropy and Cryptography
/** Refresh tokens are opaque 256-bit random values (32 bytes => 64 hex characters). */
export const REFRESH_TOKEN_BYTES = 32;

/** Email verification tokens are 32 bytes (64 hex characters). */
export const VERIFICATION_TOKEN_BYTES = 32;

/** Password reset tokens are 32 bytes (64 hex characters). */
export const RESET_PASSWORD_TOKEN_BYTES = 32;

/** Password hash version tag used by the scrypt `s1$<salt>$<hash>` format. */
export const PASSWORD_HASH_VERSION = "s1";

/** Scrypt salt byte length. */
export const SCRYPT_SALT_BYTES = 16;
export const SCRYPT_SALT_LENGTH = 16;

/** Scrypt derived key byte length. */
export const SCRYPT_KEY_LENGTH_BYTES = 64;
export const SCRYPT_KEY_LENGTH = 64;

/** Scrypt OWASP parameters. */
export const SCRYPT_N = 16384;
export const SCRYPT_R = 8;
export const SCRYPT_P = 5;
