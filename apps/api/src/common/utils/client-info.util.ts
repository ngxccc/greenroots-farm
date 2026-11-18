import type { Request } from "express";

export interface ClientMetadata {
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Extracts client network and device metadata from an Express request.
 * Normalizes headers, falls back to socket info, and clamps to schema limits:
 * - ipAddress: max 45 chars (IPv6 max length, matching DB schema)
 * - deviceName / userAgent: max 255 chars (matching DB schema)
 */
export function extractClientMetadata(req?: Request): ClientMetadata {
  if (!req) return {};

  const forwarded = req.headers["x-forwarded-for"];
  const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : forwarded;

  const realIp = req.headers["x-real-ip"];
  const realIpStr = Array.isArray(realIp) ? realIp[0] : realIp;

  const socket = (req as unknown as { socket?: { remoteAddress?: string } })
    .socket;
  const rawIp =
    typeof forwardedStr === "string"
      ? forwardedStr.split(",")[0]?.trim()
      : typeof realIpStr === "string"
        ? realIpStr.trim()
        : (req.ip ?? socket?.remoteAddress);

  const ipAddress =
    typeof rawIp === "string" ? rawIp.substring(0, 45) : undefined;

  const userAgentHeader: unknown = req.headers["user-agent"];
  const userAgentStr = Array.isArray(userAgentHeader)
    ? (userAgentHeader[0] as unknown)
    : userAgentHeader;

  const deviceName =
    typeof userAgentStr === "string"
      ? userAgentStr.trim().substring(0, 255)
      : undefined;

  return {
    deviceName,
    ipAddress,
    userAgent: deviceName,
  };
}
