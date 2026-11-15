import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { RedisService } from "./redis.service";
import { canonicalJson } from "@/common/utils/canonical-json.util";
import { sha256 } from "@/common/utils/crypto.util";

export interface CachedResponse {
  statusCode: number;
  body: unknown;
}

export interface AcquireResult {
  isNew: boolean;
  cached: CachedResponse | null;
}

interface StoredIdempotencyRecord {
  status: "PROCESSING" | "COMPLETED";
  payloadHash: string;
  statusCode?: number;
  body?: unknown;
  createdAt: string;
  completedAt?: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_PREFIX = "idempotency:";
const PROCESSING_LOCK_TTL_SECONDS = 60;
const COMPLETED_CACHE_TTL_SECONDS = 86_400; // 24 hours

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Evaluates or acquires the idempotency key lock.
   * Fail-closed: Throws ServiceUnavailableException if Redis is down.
   */
  async acquire(key: string, body: unknown): Promise<AcquireResult> {
    if (!UUID_REGEX.test(key)) {
      throw new BadRequestException(
        "Định dạng Idempotency-Key không hợp lệ, yêu cầu định dạng UUID",
      );
    }

    const payloadHash = sha256(canonicalJson(body));
    const redisKey = `${IDEMPOTENCY_KEY_PREFIX}${key}`;
    const client = this.redisService.getClient();

    let rawRecord: string | null;
    try {
      rawRecord = await client.get(redisKey);
    } catch (error) {
      this.logger.error(
        `Redis failure checking idempotency key: ${key}`,
        error,
      );
      throw new ServiceUnavailableException(
        "Dịch vụ Idempotency tạm thời không khả dụng, vui lòng thử lại",
      );
    }

    if (!rawRecord) {
      const initialRecord: StoredIdempotencyRecord = {
        status: "PROCESSING",
        payloadHash,
        createdAt: new Date().toISOString(),
      };

      try {
        const setResult = await client.set(
          redisKey,
          JSON.stringify(initialRecord),
          "EX",
          PROCESSING_LOCK_TTL_SECONDS,
          "NX",
        );

        if (setResult !== "OK") {
          // Another concurrent worker acquired the key simultaneously
          throw new ConflictException(
            "Yêu cầu với khóa định danh này đang được xử lý, vui lòng thử lại sau",
          );
        }

        return { isNew: true, cached: null };
      } catch (error) {
        if (error instanceof ConflictException) throw error;
        this.logger.error(
          `Redis failure acquiring idempotency lock: ${key}`,
          error,
        );
        throw new ServiceUnavailableException(
          "Dịch vụ Idempotency tạm thời không khả dụng, vui lòng thử lại",
        );
      }
    }

    let stored: StoredIdempotencyRecord;
    try {
      stored = JSON.parse(rawRecord) as StoredIdempotencyRecord;
    } catch {
      throw new ServiceUnavailableException(
        "Dữ liệu Idempotency không hợp lệ, vui lòng thử lại",
      );
    }

    if (stored.payloadHash !== payloadHash) {
      throw new UnprocessableEntityException(
        "Khóa Idempotency-Key đã được sử dụng với nội dung yêu cầu khác",
      );
    }

    if (stored.status === "PROCESSING") {
      throw new ConflictException(
        "Yêu cầu với khóa định danh này đang được xử lý, vui lòng thử lại sau",
      );
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
  ): Promise<void> {
    const redisKey = `${IDEMPOTENCY_KEY_PREFIX}${key}`;
    const client = this.redisService.getClient();

    try {
      const existingRaw = await client.get(redisKey);
      const existing = existingRaw
        ? (JSON.parse(existingRaw) as StoredIdempotencyRecord)
        : null;

      const completedRecord: StoredIdempotencyRecord = {
        status: "COMPLETED",
        payloadHash: existing?.payloadHash ?? "",
        statusCode,
        body,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
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
  async release(key: string): Promise<void> {
    const redisKey = `${IDEMPOTENCY_KEY_PREFIX}${key}`;
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
