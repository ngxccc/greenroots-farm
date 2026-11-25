import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

function sanitizeUrl(defaultUrl: string) {
  return z.preprocess((val) => {
    if (typeof val !== "string") return defaultUrl;
    const trimmed = val.trim().replace(/^["'\\]+|["'\\]+$/g, "");
    if (!trimmed) return defaultUrl;
    const withProtocol =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `https://${trimmed}`;
    try {
      new URL(withProtocol);
      return withProtocol;
    } catch {
      return defaultUrl;
    }
  }, z.url());
}

function parseMaintenanceFlag(raw: unknown): boolean {
  if (typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "number") {
    return raw === 1;
  }
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  return false;
}

/**
 * Validated runtime environment for the Next.js Storefront.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    API_BASE_URL: sanitizeUrl("http://localhost:3000"),
    MAINTENANCE_MODE: z
      .preprocess((val) => parseMaintenanceFlag(val), z.boolean())
      .default(false),
    INTERNAL_PROXY_SECRET: z.string().trim().min(16).optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: sanitizeUrl("http://localhost:3001"),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    API_BASE_URL: process.env.API_BASE_URL,
    MAINTENANCE_MODE: process.env.MAINTENANCE_MODE,
    INTERNAL_PROXY_SECRET: process.env.INTERNAL_PROXY_SECRET,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  emptyStringAsUndefined: true,
  skipValidation:
    Boolean(process.env.SKIP_ENV_VALIDATION) || process.env.NODE_ENV === "test",
});

/**
 * Evaluates whether Storefront maintenance mode is enabled dynamically from runtime env
 * so toggling the flag in deployment does not require rebuilding static assets.
 *
 * @returns `true` when `MAINTENANCE_MODE` is `"true"` or `"1"` (case-insensitive).
 */
export function isMaintenanceModeEnabled(): boolean {
  return parseMaintenanceFlag(process.env.MAINTENANCE_MODE);
}
