const MIN_REDIS_DB_INDEX = 0;
const MAX_REDIS_DB_INDEX = 15;

/**
 * Plain Redis connection shape shared by ioredis, BullMQ and Nest providers.
 */
export interface RedisConnectionConfig {
  host: string;
  port: number;
  db?: number;
  username?: string;
  password?: string;
  tls?: { rejectUnauthorized: boolean; servername: string };
  maxRetriesPerRequest: number | null;
}

function parseRedisDbIndex(pathname: string): number | undefined {
  const segment = pathname.replace(/^\/+/, "");
  if (!/^\d+$/.test(segment)) {
    return undefined;
  }
  const index = Number.parseInt(segment, 10);
  if (
    Number.isInteger(index) &&
    index >= MIN_REDIS_DB_INDEX &&
    index <= MAX_REDIS_DB_INDEX
  ) {
    return index;
  }
  return undefined;
}

/**
 * Parses a Redis URL into connection options with TLS and optional logical DB index (`0..15`)
 * support for managed Redis providers (Upstash, Redis Cloud, Dragonfly) and isolated workers.
 *
 * @param redisUrl Redis connection string (`redis://` or `rediss://`).
 */
export function parseRedisOptions(redisUrl?: string): RedisConnectionConfig {
  if (redisUrl && redisUrl.trim().length > 0) {
    try {
      const parsed = new URL(redisUrl);
      const isTls = parsed.protocol === "rediss:";
      const db = parseRedisDbIndex(parsed.pathname);

      return {
        host: parsed.hostname,
        port: Number(parsed.port) || 6379,
        ...(db !== undefined ? { db } : {}),
        username: parsed.username || undefined,
        password: parsed.password || undefined,
        tls: isTls
          ? { rejectUnauthorized: false, servername: parsed.hostname }
          : undefined,
        maxRetriesPerRequest: null,
      };
    } catch {
      // Fall through to local defaults when the URL is malformed.
    }
  }

  return {
    host: "localhost",
    port: 6379,
    maxRetriesPerRequest: null,
  };
}
