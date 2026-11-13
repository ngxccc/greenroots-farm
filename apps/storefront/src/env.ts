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

/**
 * Validated runtime environment for the Next.js Storefront.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    BACKEND_API_URL: sanitizeUrl("http://127.0.0.1:3001"),
  },
  client: {
    NEXT_PUBLIC_APP_URL: sanitizeUrl("http://localhost:3000"),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    BACKEND_API_URL: process.env.BACKEND_API_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  emptyStringAsUndefined: true,
  skipValidation:
    Boolean(process.env.SKIP_ENV_VALIDATION) || process.env.NODE_ENV === "test",
});
