import { isIP } from "node:net";
import { headers } from "next/headers";
import { env } from "@/env";

/**
 * Header container accepted by client-metadata extraction helpers
 * (supports Web `Headers`, `NextRequest.headers`, `next/headers`, and plain test records).
 */
export type HeaderSource =
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined>;

const MAX_USER_AGENT_LENGTH = 255;

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

function readHeaderValue(
  source: HeaderSource | undefined,
  name: string,
): string | undefined {
  if (!source) {
    return undefined;
  }

  if (typeof (source as { get?: unknown }).get === "function") {
    const val = (source as { get(n: string): string | null }).get(name);
    return val ?? undefined;
  }

  const record = source as Record<string, string | string[] | undefined>;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() !== target) {
      continue;
    }
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value) && typeof value[0] === "string") {
      return value[0];
    }
  }

  return undefined;
}

function parseValidIp(candidate: string | undefined): string | undefined {
  if (!candidate) {
    return undefined;
  }
  const trimmed = candidate.trim();
  return trimmed.length > 0 && isIP(trimmed) !== 0 ? trimmed : undefined;
}

/**
 * Extracts the canonical client IP from edge-proxy headers in strict precedence:
 * `cf-connecting-ip` -> `x-real-ip` -> rightmost valid IP in `x-forwarded-for`.
 *
 * @param source Incoming request headers.
 * @returns Validated IPv4/IPv6 string, or `undefined` when absent/invalid.
 */
export function extractSanitizedClientIp(
  source?: HeaderSource,
): string | undefined {
  const cfIp = parseValidIp(readHeaderValue(source, "cf-connecting-ip"));
  if (cfIp) {
    return cfIp;
  }

  const realIp = parseValidIp(readHeaderValue(source, "x-real-ip"));
  if (realIp) {
    return realIp;
  }

  const forwardedFor = readHeaderValue(source, "x-forwarded-for");
  if (!forwardedFor) {
    return undefined;
  }

  // Read rightmost valid IP so client-prepended entries in X-Forwarded-For cannot spoof origin.
  const parts = forwardedFor.split(",");
  for (let i = parts.length - 1; i >= 0; i--) {
    const valid = parseValidIp(parts[i]);
    if (valid) {
      return valid;
    }
  }

  return undefined;
}

/**
 * Sanitizes a caller `User-Agent` header by stripping control characters, trimming,
 * and clamping to 255 characters. Returns `""` when missing or empty so Bun/Node
 * `fetch()` does not inject a default runtime `User-Agent`.
 *
 * @param rawUserAgent Raw `User-Agent` header value.
 * @returns Sanitized `User-Agent` string or `""`.
 */
export function sanitizeUserAgent(rawUserAgent?: string | null): string {
  if (typeof rawUserAgent !== "string") {
    return "";
  }

  return stripControlCharacters(rawUserAgent)
    .trim()
    .substring(0, MAX_USER_AGENT_LENGTH);
}

/**
 * Builds sanitized downstream headers for NestJS auth calls without forwarding
 * untrusted client proxy headers (`x-forwarded-for`, `x-real-ip`, `x-bff-*`).
 *
 * @param source Incoming request headers from `NextRequest` or `next/headers`.
 * @param options Optional `proxySecret` override for isolated unit tests.
 * @returns Sanitized headers ready for `fetch()` or `openapi-fetch`.
 */
export function buildForwardedClientHeaders(
  source?: HeaderSource,
  options?: { readonly proxySecret?: string },
): Record<string, string> {
  const userAgent = sanitizeUserAgent(readHeaderValue(source, "user-agent"));
  const result: Record<string, string> = {
    "User-Agent": userAgent,
  };

  const clientIp = extractSanitizedClientIp(source);
  if (clientIp) {
    result["X-BFF-Client-IP"] = clientIp;
    const secret = options?.proxySecret ?? env.INTERNAL_PROXY_SECRET;
    if (secret) {
      result["X-Internal-Proxy-Secret"] = secret;
    }
  }

  return result;
}

/**
 * Reads and sanitizes caller `User-Agent` and client IP headers inside a Next.js
 * Server Action scope, falling back safely when invoked outside an HTTP request.
 *
 * @returns Sanitized downstream client headers.
 */
export async function readServerActionClientHeaders(): Promise<
  Record<string, string>
> {
  try {
    const incomingHeaders = await headers();
    return buildForwardedClientHeaders(incomingHeaders);
  } catch {
    return buildForwardedClientHeaders(undefined);
  }
}
