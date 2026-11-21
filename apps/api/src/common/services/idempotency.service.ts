import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { API_ERROR_CODES } from "@greenroots/shared";
import { RedisService } from "./redis.service";
import { canonicalJson } from "@/common/utils/canonical-json.util";
import { sha256 } from "@/common/utils/crypto.util";
import {
  COMPLETED_CACHE_TTL_SECONDS,
  IDEMPOTENCY_KEY_PREFIX,
  IDEMPOTENCY_STATUS,
  type IdempotencyStatus,
  PROCESSING_LOCK_TTL_SECONDS,
  UUID_V4_OR_V7_REGEX,
} from "@/common/constants/idempotency.constant";

export interface CachedResponse {
  statusCode: number;
  body: unknown;
}

export interface AcquireResult {
  isNew: boolean;
  cached: CachedResponse | null;
}

interface StoredIdempotencyRecord {
  status: IdempotencyStatus;
  payloadHash: string;
  statusCode?: number;
  body?: unknown;
  createdAt: string;
  completedAt?: string;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly redisService: RedisService) {}

  private buildRedisKey(key: string, scope?: string): string {
    return scope
      ? `${IDEMPOTENCY_KEY_PREFIX}${scope}:${key}`
      : `${IDEMPOTENCY_KEY_PREFIX}${key}`;
  }

  /**
   * Evaluates or acquires the idempotency key lock.
   * Fail-closed: Throws ServiceUnavailableException if Redis is down.
   */
  async acquire(
    key: string,
    body: unknown,
    scope?: string,
  ): Promise<AcquireResult> {
    if (!UUID_V4_OR_V7_REGEX.test(key)) {
      throw new BadRequestException({
        code: API_ERROR_CODES.VALIDATION_FAILED,
        detail: "Invalid Idempotency-Key format; a valid UUID is required.",
      });
    }

    const payloadHash = sha256(canonicalJson(body));
    const redisKey = this.buildRedisKey(key, scope);
    const client = this.redisService.getClient();

    const initialRecord: StoredIdempotencyRecord = {
      status: IDEMPOTENCY_STATUS.PROCESSING,
      payloadHash,
      createdAt: new Date().toISOString(),
    };

    let setResult: string | null = null;
    try {
      setResult = await client.set(
        redisKey,
        JSON.stringify(initialRecord),
        "EX",
        PROCESSING_LOCK_TTL_SECONDS,
        "NX",
      );
    } catch (error) {
      this.logger.error(
        `Redis failure acquiring idempotency lock: ${key}`,
        error,
      );
      throw new ServiceUnavailableException({
        code: API_ERROR_CODES.SERVICE_UNAVAILABLE,
        detail: "Idempotency service is temporarily unavailable.",
      });
    }

    // If NX succeeded, key was completely new: lock acquired in 1 round trip
    if (setResult === "OK") {
      return { isNew: true, cached: null };
    }

    // Key already exists (either concurrent PROCESSING or COMPLETED)
    let rawRecord: string | null = null;
    try {
      rawRecord = await client.get(redisKey);
    } catch (error) {
      this.logger.error(
        `Redis failure checking idempotency key: ${key}`,
        error,
      );
      throw new ServiceUnavailableException({
        code: API_ERROR_CODES.SERVICE_UNAVAILABLE,
        detail: "Idempotency service is temporarily unavailable.",
      });
    }

    if (!rawRecord) {
      // In case the key expired between SET NX and GET, treat as concurrent contention
      throw new ConflictException({
        code: API_ERROR_CODES.CONFLICT,
        detail:
          "A request with this Idempotency-Key is currently being processed.",
      });
    }

    let stored: StoredIdempotencyRecord;
    try {
      stored = JSON.parse(rawRecord) as StoredIdempotencyRecord;
    } catch {
      throw new ServiceUnavailableException({
        code: API_ERROR_CODES.SERVICE_UNAVAILABLE,
        detail: "Idempotency record is invalid; please retry.",
      });
    }

    if (stored.payloadHash !== payloadHash) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.UNPROCESSABLE_ENTITY,
        detail:
          "Idempotency-Key was already used with a different request payload.",
      });
    }

    if (stored.status === IDEMPOTENCY_STATUS.PROCESSING) {
      throw new ConflictException({
        code: API_ERROR_CODES.CONFLICT,
        detail:
          "A request with this Idempotency-Key is currently being processed.",
      });
    }

    return {
      isNew: false,
      cached: {
        statusCode: stored.statusCode ?? 200,
        body: stored.body,
      },
    };
  }

  /**
   * Finalizes the idempotency record with the completed response and sets 24h TTL.
   */
  async complete(
    key: string,
    statusCode: number,
    body: unknown,
    ttlSeconds = COMPLETED_CACHE_TTL_SECONDS,
    requestPayload?: unknown,
    scope?: string,
  ): Promise<void> {
    const redisKey = this.buildRedisKey(key, scope);
    const client = this.redisService.getClient();

    try {
      let payloadHash = "";
      let createdAt = new Date().toISOString();

      if (requestPayload !== undefined) {
        payloadHash = sha256(canonicalJson(requestPayload));
      } else {
        const existingRaw = await client.get(redisKey);
        if (existingRaw) {
          try {
            const existing = JSON.parse(existingRaw) as StoredIdempotencyRecord;
            payloadHash = existing.payloadHash;
            createdAt = existing.createdAt;
          } catch {
            // Ignore parse errors on fallback
          }
        }
      }

      const completedRecord: StoredIdempotencyRecord = {
        status: IDEMPOTENCY_STATUS.COMPLETED,
        payloadHash,
        statusCode,
        body,
        createdAt,
        completedAt: new Date().toISOString(),
      };

      await client.set(
        redisKey,
        JSON.stringify(completedRecord),
        "EX",
        ttlSeconds,
      );
    } catch (error) {
      this.logger.error(
        `Redis failure completing idempotency key: ${key}`,
        error,
      );
      // Non-blocking logger on complete; client has already received response
    }
  }

  /**
   * Releases/deletes the idempotency record if the domain transaction or controller failed.
   */
  async release(key: string, scope?: string): Promise<void> {
    const redisKey = this.buildRedisKey(key, scope);
    const client = this.redisService.getClient();

    try {
      await client.del(redisKey);
    } catch (error) {
      this.logger.error(
        `Redis failure releasing idempotency key: ${key}`,
        error,
      );
    }
  }
}
