/**
 * Plain Redis connection shape shared by ioredis, BullMQ and Nest providers.
 */
export interface RedisConnectionConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: { rejectUnauthorized: boolean; servername: string };
  maxRetriesPerRequest: number | null;
}

/**
 * Parses a Redis URL into connection options with TLS support for managed
 * Redis providers (Upstash, Redis Cloud, Dragonfly).
 *
 * @param redisUrl Redis connection string (`redis://` or `rediss://`).
 */
export function parseRedisOptions(redisUrl?: string): RedisConnectionConfig {
  if (redisUrl && redisUrl.trim().length > 0) {
    try {
      const parsed = new URL(redisUrl);
      const isTls = parsed.protocol === "rediss:";

      return {
        host: parsed.hostname,
        port: Number(parsed.port) || 6379,
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
