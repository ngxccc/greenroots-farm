import { timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { Request } from "express";
import { env } from "@/common/config/env.config";

export interface ClientMetadata {
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
}

function stripControlCharacters(value: string): string {
  let result = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code >= 0x20 && code !== 0x7f) {
      result += ch;
    }
  }
  return result;
}

function extractFirstHeaderValue(raw: unknown): string | undefined {
  if (typeof raw === "string") {
    return raw;
  }
  if (Array.isArray(raw) && typeof raw[0] === "string") {
    return raw[0];
  }
  return undefined;
}

function hasValidInternalProxySecret(
  headerValue: unknown,
  expectedSecret: string,
): boolean {
  const provided = extractFirstHeaderValue(headerValue);
  if (!provided) {
    return false;
  }

  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expectedSecret, "utf8");
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(providedBuf, expectedBuf);
}

function sanitizeUserAgent(rawHeader: unknown): string | undefined {
  const raw = extractFirstHeaderValue(rawHeader);
  if (!raw) {
    return undefined;
  }

  const sanitized = stripControlCharacters(raw).trim().substring(0, 255);
  return sanitized.length > 0 ? sanitized : undefined;
}

/**
 * Resolves the trusted client IP for an incoming Express request.
 *
 * Trusts `X-BFF-Client-IP` (validated via `isIP`) only when `INTERNAL_PROXY_SECRET`
 * is configured and `X-Internal-Proxy-Secret` matches in constant time. Otherwise
 * ignores unauthenticated proxy headers and falls back to `req.ip` (`trust proxy`).
 *
 * @param req Express request object.
 * @param expectedSecret Optional shared secret override for deterministic unit tests.
 * @returns Client IP clamped to 45 characters (IPv6 max), or `undefined`.
 */
export function resolveTrustedClientIp(
  req?: Request,
  expectedSecret: string | undefined = env.INTERNAL_PROXY_SECRET,
): string | undefined {
  if (!req) {
    return undefined;
  }

  if (expectedSecret) {
    const secretHeader: unknown = req.headers["x-internal-proxy-secret"];
    if (hasValidInternalProxySecret(secretHeader, expectedSecret)) {
      const bffIp = extractFirstHeaderValue(
        req.headers["x-bff-client-ip"],
      )?.trim();
      if (bffIp && isIP(bffIp) !== 0) {
        return bffIp.substring(0, 45);
      }
    }
  }

  const socket = (req as unknown as { socket?: { remoteAddress?: string } })
    .socket;
  const rawIp = req.ip ?? socket?.remoteAddress;

  if (typeof rawIp !== "string") {
    return undefined;
  }

  const trimmed = rawIp.trim();
  return trimmed.length > 0 ? trimmed.substring(0, 45) : undefined;
}

/**
 * Extracts client network and device metadata from an Express request.
 * Normalizes headers, enforces the BFF shared-secret trust boundary, and clamps to schema limits:
 * - ipAddress: max 45 chars (IPv6 max length, matching DB schema)
 * - deviceName / userAgent: max 255 chars (matching DB schema), `undefined` when empty
 *
 * @param req Express request object.
 * @param expectedSecret Optional shared secret override for deterministic unit tests.
 * @returns Sanitized client metadata for session persistence.
 */
export function extractClientMetadata(
  req?: Request,
  expectedSecret: string | undefined = env.INTERNAL_PROXY_SECRET,
): ClientMetadata {
  if (!req) return {};

  const ipAddress = resolveTrustedClientIp(req, expectedSecret);
  const deviceName = sanitizeUserAgent(req.headers["user-agent"]);

  return {
    deviceName,
    ipAddress,
    userAgent: deviceName,
  };
}
