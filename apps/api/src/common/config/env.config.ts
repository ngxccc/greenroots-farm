import { z } from "zod";
import {
  LOG_LEVELS,
  MAIL_DRIVERS,
  NODE_ENVIRONMENTS,
  PAYMENT_DRIVERS,
} from "@/common/constants/environment.constant";

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

  JWT_ACCESS_SECRET: z
    .string()
    .min(32)
    .default("greenroots-dev-access-secret-min-32-chars"),
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

  // Cloudinary media storage configuration
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Scheduled tasks / Cron
  CRON_SECRET: z.string().optional(),

  // Public URLs and CORS
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3001,http://localhost:3002"),
  STOREFRONT_URL: z.url().default("http://localhost:3001"),
  BACKOFFICE_URL: z.url().default("http://localhost:3002"),
});

export type ApiEnvironment = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid API environment configuration: ${details}`);
}

export const env: ApiEnvironment = parsed.data;
