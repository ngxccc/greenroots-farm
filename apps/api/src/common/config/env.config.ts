import { z } from "zod";
import {
  GEOCODING_DRIVERS,
  LOG_LEVELS,
  MAIL_DRIVERS,
  MEDIA_DRIVERS,
  NODE_ENVIRONMENTS,
  PAYMENT_DRIVERS,
  SHIPPING_DRIVERS,
} from "@/common/constants/environment.constant";

const DEV_JWT_ACCESS_SECRET = "greenroots-dev-access-secret-min-32-chars";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "::1", "[::1]", "0.0.0.0"]);

/**
 * Checks whether a URL hostname targets a loopback or unspecified local address.
 *
 * @param hostname Parsed URL hostname.
 * @returns `true` when the hostname is a loopback or `.localhost` address.
 */
export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    LOOPBACK_HOSTNAMES.has(normalized) ||
    normalized.startsWith("127.") ||
    normalized.endsWith(".localhost")
  );
}

/**
 * Validates and normalizes `STOREFRONT_URL` to a canonical HTTP(S) origin without
 * credentials, trailing slashes, path prefixes, query strings, or hash fragments.
 *
 * @param rawUrl Raw URL string supplied from environment configuration.
 * @returns Normalized URL origin (`scheme://host[:port]`).
 */
export function normalizeStorefrontOrigin(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("STOREFRONT_URL must use http or https protocol");
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "STOREFRONT_URL must be a pure origin without credentials, path, query, or hash",
    );
  }
  return parsed.origin;
}

/**
 * Resolves the canonical public storefront origin for link and QR URL generation,
 * failing closed in production when the origin is non-HTTPS or loopback.
 *
 * @param rawUrl Configured `STOREFRONT_URL` string.
 * @param nodeEnv Active `NODE_ENV` value.
 * @returns Normalized storefront origin safe for the active environment.
 */
export function resolvePublicStorefrontOrigin(
  rawUrl: string,
  nodeEnv: string,
): string {
  const origin = normalizeStorefrontOrigin(rawUrl);
  if (nodeEnv === "production") {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:") {
      throw new Error("STOREFRONT_URL must use https in production");
    }
    if (isLoopbackHostname(parsed.hostname)) {
      throw new Error(
        "STOREFRONT_URL must not resolve to localhost or a loopback address in production",
      );
    }
  }
  return origin;
}

/**
 * Validated process environment for the API process and CLI tooling.
 *
 * Defaults keep local tooling (type-check, unit tests, drizzle-kit) runnable
 * without a populated `.env`; real deployments inject values through Doppler.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(NODE_ENVIRONMENTS).default("development"),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("debug"),

  // Runtime database connection, also used by drizzle-kit migrations.
  DB_URL: z.string().min(1).optional(),
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USERNAME: z.string().default("postgres"),
  DB_PASSWORD: z.string().default("postgrespassword"),
  DB_NAME: z.string().min(1).default("greenroots_farm"),
  DB_LOGGING: z
    .preprocess(
      (val) => val === "true" || val === true || val === "1" || val === 1,
      z.boolean(),
    )
    .default(true),

  REDIS_URL: z.string().default("redis://localhost:6379"),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),

  JWT_ACCESS_SECRET: z.string().min(32).default(DEV_JWT_ACCESS_SECRET),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  // Mail (Resend / Mock) configuration
  MAIL_DRIVER: z.enum(MAIL_DRIVERS).default("mock"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("GreenRoots Farm <no-reply@greenroots.farm>"),

  // Payment (PayOS / Mock) configuration
  PAYMENT_DRIVER: z.enum(PAYMENT_DRIVERS).default("mock"),
  PAYOS_CLIENT_ID: z.string().optional(),
  PAYOS_API_KEY: z.string().optional(),
  PAYOS_CHECKSUM_KEY: z.string().optional(),

  // Shipping calculation driver configuration
  SHIPPING_DRIVER: z.enum(SHIPPING_DRIVERS).default("haversine"),

  // Geocoding (Goong / Vietmap / Mock) configuration
  GEOCODING_DRIVER: z.enum(GEOCODING_DRIVERS).default("mock"),
  GOONG_API_KEY: z.string().optional(),
  VIETMAP_API_KEY: z.string().optional(),

  // Cloudinary media storage configuration
  MEDIA_DRIVER: z.enum(MEDIA_DRIVERS).default("mock"),
  CLOUDINARY_CLOUD_NAME: z.string().min(1).default("greenroots-dev"),
  CLOUDINARY_API_KEY: z.string().min(1).default("mock-api-key"),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Scheduled tasks / Cron
  CRON_SECRET: z.string().optional(),

  // Shared-secret trust boundary for Storefront BFF forwarded client IP
  INTERNAL_PROXY_SECRET: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().trim().min(16).optional(),
  ),

  // Public URLs and CORS
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3001,http://localhost:3002"),
  STOREFRONT_URL: z
    .string()
    .trim()
    .default("http://localhost:3001")
    .transform((val, ctx) => {
      try {
        return normalizeStorefrontOrigin(val);
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          message:
            error instanceof Error
              ? error.message
              : "STOREFRONT_URL must be a valid HTTP(S) origin",
        });
        return z.NEVER;
      }
    }),
  BACKOFFICE_URL: z.url().default("http://localhost:3002"),
});

export type ApiEnvironment = z.infer<typeof envSchema>;

/**
 * Parses and validates API environment variables, failing fast in production
 * when required secrets or integration credentials are missing or use dev defaults.
 */
export function parseApiEnvironment(
  rawEnv: Record<string, string | undefined>,
): ApiEnvironment {
  const productionSchema = envSchema.superRefine((data, ctx) => {
    if (data.NODE_ENV !== "production") return;

    if (
      !rawEnv["JWT_ACCESS_SECRET"]?.trim() ||
      data.JWT_ACCESS_SECRET === DEV_JWT_ACCESS_SECRET
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_ACCESS_SECRET"],
        message:
          "JWT_ACCESS_SECRET must be explicitly configured to a non-default secret in production",
      });
    }
    if (data.MAIL_DRIVER === "resend" && !data.RESEND_API_KEY?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message:
          "RESEND_API_KEY is required when MAIL_DRIVER is 'resend' in production",
      });
    }
    if (data.PAYMENT_DRIVER === "payos") {
      if (!data.PAYOS_CLIENT_ID?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["PAYOS_CLIENT_ID"],
          message:
            "PAYOS_CLIENT_ID is required when PAYMENT_DRIVER is 'payos' in production",
        });
      }
      if (!data.PAYOS_API_KEY?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["PAYOS_API_KEY"],
          message:
            "PAYOS_API_KEY is required when PAYMENT_DRIVER is 'payos' in production",
        });
      }
      if (!data.PAYOS_CHECKSUM_KEY?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["PAYOS_CHECKSUM_KEY"],
          message:
            "PAYOS_CHECKSUM_KEY is required when PAYMENT_DRIVER is 'payos' in production",
        });
      }
    }
    if (data.GEOCODING_DRIVER === "goong" && !data.GOONG_API_KEY?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["GOONG_API_KEY"],
        message:
          "GOONG_API_KEY is required when GEOCODING_DRIVER is 'goong' in production",
      });
    }
    if (data.GEOCODING_DRIVER === "vietmap" && !data.VIETMAP_API_KEY?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["VIETMAP_API_KEY"],
        message:
          "VIETMAP_API_KEY is required when GEOCODING_DRIVER is 'vietmap' in production",
      });
    }
    if (!rawEnv["CLOUDINARY_CLOUD_NAME"]?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["CLOUDINARY_CLOUD_NAME"],
        message: "CLOUDINARY_CLOUD_NAME is required in production",
      });
    }
    if (!rawEnv["CLOUDINARY_API_KEY"]?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["CLOUDINARY_API_KEY"],
        message: "CLOUDINARY_API_KEY is required in production",
      });
    }
    if (!data.CLOUDINARY_API_SECRET?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["CLOUDINARY_API_SECRET"],
        message: "CLOUDINARY_API_SECRET is required in production",
      });
    }
    if (!rawEnv["STOREFRONT_URL"]?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["STOREFRONT_URL"],
        message: "STOREFRONT_URL must be explicitly configured in production",
      });
    } else if (URL.canParse(data.STOREFRONT_URL)) {
      try {
        resolvePublicStorefrontOrigin(data.STOREFRONT_URL, data.NODE_ENV);
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          path: ["STOREFRONT_URL"],
          message:
            error instanceof Error
              ? error.message
              : "STOREFRONT_URL is invalid for production",
        });
      }
    }
  });

  const parsed = productionSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid API environment configuration: ${details}`);
  }

  return parsed.data;
}

export const env: ApiEnvironment = parseApiEnvironment(process.env);
