import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import {
  AUTH_REVOCATION_TOKEN_PREFIX,
  AUTH_REVOCATION_USER_PREFIX,
  AUTH_REVOCATION_TTL_SECONDS,
  REDIS_DEGRADED_COOLDOWN_MS,
} from "@/common/constants/auth.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import { env } from "@/common/config/env.config";
import { parseRedisOptions } from "@/common/config/redis.config";

/**
 * Redis-backed session revocation store.
 *
 * The guard contract is fail-open: when Redis is unreachable the API logs a
 * warning and authorizes the request instead of taking the platform down.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private degradedUntil = 0;
  private degraded = false;

  constructor() {
    this.client = new Redis({
      ...parseRedisOptions(env.REDIS_URL),
      lazyConnect: true,
      enableOfflineQueue: true,
      connectTimeout: 750,
      commandTimeout: 500,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });

    this.client.on("error", () => {
      // Errors are surfaced through the guarded operations below; suppress the
      // EventEmitter's default unhandled-error behaviour.
    });
  }

  /**
   * Returns the underlying Redis client for fail-closed critical sections.
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Returns whether a user or specific token is revoked in Redis.
   * Performs a single round-trip pipelined mget for user and token keys.
   * Returns `false` (fail-open) when Redis is degraded or unreachable.
   */
  async isRevoked(userId: string, jti?: string): Promise<boolean> {
    if (Date.now() < this.degradedUntil) {
      return false;
    }

    try {
      const keys: string[] = [`${AUTH_REVOCATION_USER_PREFIX}${userId}`];
      if (jti) {
        keys.push(`${AUTH_REVOCATION_TOKEN_PREFIX}${jti}`);
      }

      const values = await this.client.mget(keys);
      this.exitDegradedMode();
      return Array.isArray(values) && values.some((val) => val !== null);
    } catch {
      this.enterDegradedMode();
      return false;
    }
  }

  /**
   * Blacklists a single access token by its jti in Redis until expiration (max 15 minutes).
   * If ttlSeconds <= 0, no-op since the token is already expired.
   */
  async revokeToken(jti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      return;
    }

    const effectiveTtl = Math.min(
      Math.floor(ttlSeconds),
      AUTH_REVOCATION_TTL_SECONDS,
    );

    try {
      await this.client.set(
        `${AUTH_REVOCATION_TOKEN_PREFIX}${jti}`,
        "1",
        "EX",
        effectiveTtl,
      );
      this.exitDegradedMode();
    } catch {
      this.enterDegradedMode();
    }
  }

  /**
   * Revokes all access tokens for a user for the 15-minute access-token window.
   */
  async revokeUser(
    userId: string,
    ttlSeconds = AUTH_REVOCATION_TTL_SECONDS,
  ): Promise<void> {
    try {
      await this.client.set(
        `${AUTH_REVOCATION_USER_PREFIX}${userId}`,
        "1",
        "EX",
        ttlSeconds,
      );
      this.exitDegradedMode();
    } catch {
      this.enterDegradedMode();
    }
  }

  /**
   * Backward-compatible alias for user-level token revocation check.
   * @deprecated Use `isRevoked(userId, jti)` instead.
   */
  async isAccessTokenRevoked(userId: string): Promise<boolean> {
    return this.isRevoked(userId);
  }

  /**
   * Backward-compatible alias for user-level token revocation.
   * @deprecated Use `revokeUser(userId, ttlSeconds)` instead.
   */
  async revokeAccessToken(
    userId: string,
    ttlSeconds = AUTH_REVOCATION_TTL_SECONDS,
  ): Promise<void> {
    return this.revokeUser(userId, ttlSeconds);
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }

  private enterDegradedMode(): void {
    if (!this.degraded) {
      this.degraded = true;
      this.logger.warn(MESSAGES.AUTH.REDIS_REVOCATION_UNAVAILABLE);
    }
    this.degradedUntil = Date.now() + REDIS_DEGRADED_COOLDOWN_MS;
  }

  private exitDegradedMode(): void {
    if (!this.degraded) return;

    this.degraded = false;
    this.degradedUntil = 0;
    this.logger.log(MESSAGES.AUTH.REDIS_REVOCATION_RECOVERED);
  }
}
