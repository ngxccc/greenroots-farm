import type { ScryptOptions } from "node:crypto";
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import {
  PASSWORD_HASH_VERSION,
  REFRESH_TOKEN_BYTES,
} from "@/common/constants/auth.constant";

const scryptAsync = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keyLength: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * OWASP Password Storage Cheat Sheet parameters: N=16384, r=8, p=5.
 * Memory usage is dominated by 128 * N * r (16 MiB), hence the explicit maxmem.
 */
const SCRYPT_OPTIONS: ScryptOptions = {
  N: 16384,
  r: 8,
  p: 5,
  maxmem: 64 * 1024 * 1024,
};

const KEY_LENGTH_BYTES = 64;
const SALT_BYTES = 16;

function deriveKey(password: string, salt: string): Promise<Buffer> {
  return scryptAsync(password, salt, KEY_LENGTH_BYTES, SCRYPT_OPTIONS);
}

/**
 * Hashes a plaintext password using node:crypto scrypt with the versioned
 * storage format `s1$<salt>$<hash>`.
 *
 * @param password Plaintext password.
 * @returns Versioned scrypt hash safe for the `users.password` column.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derivedKey = await deriveKey(password, salt);
  return `${PASSWORD_HASH_VERSION}$${salt}$${derivedKey.toString("hex")}`;
}

/**
 * Verifies a plaintext password against a stored `s1$<salt>$<hash>` value
 * using a timing-safe comparison.
 *
 * @param password Plaintext password.
 * @param storedHash Stored versioned scrypt hash.
 * @returns `true` when the password matches.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [version, salt, hash] = storedHash.split("$", 3);

  if (version !== PASSWORD_HASH_VERSION || !salt || !hash) {
    return false;
  }

  const derivedKey = await deriveKey(password, salt);
  const expected = Buffer.from(hash, "hex");

  if (derivedKey.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, expected);
}

/**
 * Computes the deterministic SHA-256 hex digest used for refresh/verification
 * token storage. Raw tokens are never persisted.
 *
 * @param value Raw token or arbitrary string.
 * @returns 64-character lowercase hex digest.
 */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Generates an opaque 256-bit refresh token encoded as 64 hex characters.
 * Refresh tokens are deliberately NOT JWTs.
 */
export function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString("hex");
}

/**
 * Hashes a raw refresh token with SHA-256 before database persistence.
 */
export function hashRefreshToken(rawToken: string): string {
  return sha256(rawToken);
}
