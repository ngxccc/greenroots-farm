import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { AUTH_REVOCATION_KEY_PREFIX } from "@/common/constants/auth.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import { env } from "@/common/config/env.config";
import { parseRedisOptions } from "@/common/config/redis.config";

/** How long the fail-open circuit stays open after a Redis failure. */
const REDIS_DEGRADED_COOLDOWN_MS = 30_000;

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
   * Returns whether the user's access tokens are revoked.
   * Returns `false` (fail-open) when Redis is unavailable.
   */
  async isAccessTokenRevoked(userId: string): Promise<boolean> {
    if (Date.now() < this.degradedUntil) {
      return false;
    }

    try {
      const value = await this.client.get(
        `${AUTH_REVOCATION_KEY_PREFIX}${userId}`,
      );
      this.exitDegradedMode();
      return value !== null;
    } catch {
      this.enterDegradedMode();
      return false;
    }
  }

  /**
   * Revokes every access token for a user for the 15-minute access-token window.
   * Called by authentication flows later; infrastructure is ready here.
   */
  async revokeAccessToken(userId: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(
        `${AUTH_REVOCATION_KEY_PREFIX}${userId}`,
        "1",
        "EX",
        ttlSeconds,
      );
      this.exitDegradedMode();
    } catch {
      this.enterDegradedMode();
    }
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
