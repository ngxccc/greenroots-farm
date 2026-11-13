import { drizzle } from "drizzle-orm/node-postgres";
import type { Logger as DrizzleLogger } from "drizzle-orm/logger";
import { Pool, type PoolConfig } from "pg";
import { env } from "@/common/config/env.config";
import { normalizeDatabaseUrl } from "./database-url.util";
import * as schema from "./schemas";
import type { DrizzleDB } from "./database.module";

/**
 * Creates the `pg` pool for either a URL-based (Neon) or discrete (local)
 * configuration. `DB_URL` always wins; discrete DB_* variables are the fallback.
 */
export function createDatabasePool(
  overrides?: PoolConfig,
  customUrl?: string,
): Pool {
  const databaseUrl = normalizeDatabaseUrl(customUrl ?? env.DB_URL);

  const baseConfig: PoolConfig = {
    connectionTimeoutMillis: 5000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    max: 10,
  };

  if (databaseUrl) {
    return new Pool({
      ...baseConfig,
      connectionString: databaseUrl,
      ...overrides,
    });
  }

  return new Pool({
    ...baseConfig,
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ...overrides,
  });
}

/**
 * Instantiates the Drizzle client with v1 relational metadata (`defineRelations`).
 */
export function createDrizzleClient(
  pool: Pool,
  logger?: DrizzleLogger,
): DrizzleDB {
  return drizzle({
    client: pool,
    relations: schema.schemaRelations,
    logger,
    jit: true,
  });
}
