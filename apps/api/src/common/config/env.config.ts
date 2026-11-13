import { z } from "zod";
import { NODE_ENVIRONMENTS } from "@/common/constants/environment.constant";

/**
 * Validated process environment for the API process and CLI tooling.
 *
 * Defaults keep local tooling (type-check, unit tests, drizzle-kit) runnable
 * without a populated `.env`; real deployments inject values through Doppler.
 */
const envSchema = z.object({
  PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(Number(process.env["API_PORT"] ?? 3000)),
  NODE_ENV: z.enum(NODE_ENVIRONMENTS).default("development"),

  // Runtime database connection, also used by drizzle-kit migrations.
  DB_URL: z.string().min(1).optional(),
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USERNAME: z.string().default("postgres"),
  DB_PASSWORD: z.string().default("postgrespassword"),
  DB_NAME: z
    .string()
    .min(1)
    .default(process.env["DB_DATABASE"] ?? "greenroots_farm"),

  REDIS_URL: z.string().default("redis://localhost:6379"),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32)
    .default(
      process.env["JWT_SECRET"] ?? "greenroots-dev-access-secret-min-32-chars",
    ),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
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
