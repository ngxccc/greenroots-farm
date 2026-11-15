import Redis from "ioredis";
import { Pool } from "pg";
import { env } from "@/common/config/env.config";
import { parseRedisOptions } from "@/common/config/redis.config";

export interface InfrastructureStatus {
  postgres: boolean;
  redis: boolean;
  isReady: boolean;
}

/**
 * Rapidly probes PostgreSQL connectivity with a strict timeout.
 */
export async function probePostgres(timeoutMs = 500): Promise<boolean> {
  const pool = new Pool({
    connectionString: env.DB_URL,
    connectionTimeoutMillis: timeoutMs,
    max: 1,
  });

  try {
    const client = await pool.connect();
    await client.query("SELECT 1;");
    client.release();
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/**
 * Rapidly probes Redis connectivity with zero retry and fail-fast timeout.
 */
export async function probeRedis(timeoutMs = 500): Promise<boolean> {
  const redisOptions = parseRedisOptions(env.REDIS_URL);
  const client = new Redis({
    ...redisOptions,
    connectTimeout: timeoutMs,
    commandTimeout: timeoutMs,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    enableOfflineQueue: false,
  });

  client.on("error", () => undefined);

  try {
    await client.connect();
    await client.ping();
    return true;
  } catch {
    return false;
  } finally {
    try {
      client.disconnect();
    } catch {
      // Fail-open on disconnect
    }
  }
}

/**
 * Probes all required backend services in parallel.
 */
export async function probeInfrastructure(
  timeoutMs = 500,
): Promise<InfrastructureStatus> {
  const [postgres, redis] = await Promise.all([
    probePostgres(timeoutMs),
    probeRedis(timeoutMs),
  ]);

  return {
    postgres,
    redis,
    isReady: postgres && redis,
  };
}

/**
 * Prints a clear, standardized terminal alert when infrastructure is missing.
 */
export function printInfrastructureFailureAlert(
  status: InfrastructureStatus,
): void {
  const line = "=".repeat(72);
  const divider = "-".repeat(72);
  const pgStatus = status.postgres ? "ONLINE" : "OFFLINE (Unreachable)";
  const redisStatus = status.redis ? "ONLINE" : "OFFLINE (Unreachable)";

  console.error(`\n${line}`);
  console.error(" [TEST INFRASTRUCTURE CHECK FAILED]");
  console.error(
    " Integration / E2E test execution requires active Docker dependencies:",
  );
  console.error(`   - PostgreSQL (5432): ${pgStatus}`);
  console.error(`   - Redis (6379):      ${redisStatus}`);
  console.error(divider);
  console.error(" To start the local infrastructure containers, run:");
  console.error("   $ bun run docker:up");
  console.error("");
  console.error(
    " To run only unit tests without infrastructure dependencies, run:",
  );
  console.error("   $ bun test src/");
  console.error(`${line}\n`);
}
