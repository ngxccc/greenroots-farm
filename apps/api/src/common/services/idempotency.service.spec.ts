import { describe, expect, it, beforeEach, spyOn } from "bun:test";
import {
  BadRequestException,
  ConflictException,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { IdempotencyService } from "./idempotency.service";
import type { RedisService } from "./redis.service";
import {
  IDEMPOTENCY_KEY_PREFIX,
  IDEMPOTENCY_STATUS,
} from "@/common/constants/idempotency.constant";

describe("IdempotencyService", () => {
  const validKey = "019318b7-657d-7848-8df0-e374528148b1";
  const defaultPayload = { amount: 1000, currency: "VND" };

  let service: IdempotencyService;
  let mockRedis: ReturnType<typeof createMockRedis>;

  function createMockRedis() {
    const store = new Map<string, { value: string; ttl?: number }>();
    let throwOnOperation = false;
    let forceNxNull = false;
    let throwOnGet = false;

    return {
      store,
      setThrow(val: boolean) {
        throwOnOperation = val;
      },
      setForceNxNull(val: boolean) {
        forceNxNull = val;
      },
      setThrowOnGet(val: boolean) {
        throwOnGet = val;
      },
      client: {
        get(key: string) {
          if (throwOnOperation || throwOnGet) {
            return Promise.reject(new Error("Connection refused"));
          }
          const item = store.get(key);
          return Promise.resolve(item ? item.value : null);
        },
        set(
          key: string,
          value: string,
          _mode?: string,
          duration?: number,
          flag?: string,
        ) {
          if (throwOnOperation) {
            return Promise.reject(new Error("Connection refused"));
          }
          if (flag === "NX" && (forceNxNull || store.has(key))) {
            return Promise.resolve(null);
          }
          store.set(key, { value, ttl: duration });
          return Promise.resolve("OK");
        },
        del(key: string) {
          if (throwOnOperation) {
            return Promise.reject(new Error("Connection refused"));
          }
          store.delete(key);
          return Promise.resolve(1);
        },
      },
    };
  }

  beforeEach(() => {
    spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    mockRedis = createMockRedis();
    service = new IdempotencyService({
      getClient: () => mockRedis.client,
    } as unknown as RedisService);
  });

  describe("acquire", () => {
    it("should acquire lock with PROCESSING status when called with a new key", async () => {
      const result = await service.acquire(validKey, defaultPayload);

      expect(result.isNew).toBe(true);
      expect(result.cached).toBeNull();

      const stored = JSON.parse(
        mockRedis.store.get(`${IDEMPOTENCY_KEY_PREFIX}${validKey}`)?.value ??
          "{}",
      ) as { status: string; payloadHash: string };
      expect(stored.status).toBe(IDEMPOTENCY_STATUS.PROCESSING);
      expect(stored.payloadHash).toBeDefined();
    });

    it("should fail-closed with 503 when stored Redis record is corrupted JSON", () => {
      mockRedis.store.set(`${IDEMPOTENCY_KEY_PREFIX}${validKey}`, {
        value: "not-valid-json",
      });
      expect(service.acquire(validKey, defaultPayload)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it("should return cached response when replayed with identical payload", async () => {
      const canonicalPayload = { items: [{ id: "prod-1", quantity: 2 }] };
      const reorderedPayload = { items: [{ quantity: 2, id: "prod-1" }] };

      await service.acquire(validKey, canonicalPayload);
      await service.complete(validKey, 201, { orderId: "order-123" });

      // Different key order tests canonical JSON stability
      const replayResult = await service.acquire(validKey, reorderedPayload);

      expect(replayResult.isNew).toBe(false);
      expect(replayResult.cached).toEqual({
        statusCode: 201,
        body: { orderId: "order-123" },
      });
    });

    it("should reject with 422 Unprocessable Entity when payload differs from original request", async () => {
      await service.acquire(validKey, { amount: 1000 });
      await service.complete(validKey, 200, { success: true });

      expect(service.acquire(validKey, { amount: 2000 })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it("should reject with 409 Conflict when concurrent request is still PROCESSING", () => {
      void service.acquire(validKey, defaultPayload);

      expect(service.acquire(validKey, defaultPayload)).rejects.toThrow(
        ConflictException,
      );
    });

    it("should reject with 409 Conflict on SET NX race condition", () => {
      mockRedis.setForceNxNull(true);

      expect(service.acquire(validKey, defaultPayload)).rejects.toThrow(
        ConflictException,
      );
    });

    it("should fail closed with 503 when Redis GET fails while checking existing record", () => {
      mockRedis.setForceNxNull(true);
      mockRedis.setThrowOnGet(true);

      expect(service.acquire(validKey, defaultPayload)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it("should fail closed with 503 Service Unavailable when Redis connection is lost", () => {
      mockRedis.setThrow(true);

      expect(service.acquire(validKey, defaultPayload)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it("should reject with 400 Bad Request when Idempotency-Key is not a valid UUID", () => {
      expect(
        service.acquire("invalid-not-a-uuid", defaultPayload),
      ).rejects.toThrow(BadRequestException);
    });

    it("should handle undefined request body on acquire and replay", async () => {
      const newResult = await service.acquire(validKey, undefined);
      expect(newResult.isNew).toBe(true);
      expect(newResult.cached).toBeNull();

      await service.complete(validKey, 204, null);

      const replayResult = await service.acquire(validKey, undefined);
      expect(replayResult.isNew).toBe(false);
      expect(replayResult.cached).toEqual({
        statusCode: 204,
        body: null,
      });
    });
  });

  describe("complete", () => {
    it("should record COMPLETED status and cache response body when mutation finishes", async () => {
      await service.acquire(validKey, defaultPayload);
      await service.complete(validKey, 200, { result: "done" });

      const stored = JSON.parse(
        mockRedis.store.get(`${IDEMPOTENCY_KEY_PREFIX}${validKey}`)?.value ??
          "{}",
      ) as { status: string; statusCode: number; body: unknown };

      expect(stored.status).toBe(IDEMPOTENCY_STATUS.COMPLETED);
      expect(stored.statusCode).toBe(200);
      expect(stored.body).toEqual({ result: "done" });
    });

    it("should store custom ttlSeconds when completing a request", async () => {
      const customTtl = 3600;
      await service.acquire(validKey, defaultPayload);
      await service.complete(validKey, 200, { result: "done" }, customTtl);

      const storedItem = mockRedis.store.get(
        `${IDEMPOTENCY_KEY_PREFIX}${validKey}`,
      );
      expect(storedItem?.ttl).toBe(customTtl);
    });

    it("should compute payloadHash directly when requestPayload is supplied to complete()", async () => {
      const explicitPayload = { orderId: "ord-999" };
      await service.complete(
        validKey,
        200,
        { result: "ok" },
        3600,
        explicitPayload,
      );

      const stored = JSON.parse(
        mockRedis.store.get(`${IDEMPOTENCY_KEY_PREFIX}${validKey}`)?.value ??
          "{}",
      ) as { status: string; payloadHash: string };

      expect(stored.status).toBe(IDEMPOTENCY_STATUS.COMPLETED);
      expect(stored.payloadHash).toBeDefined();
      expect(stored.payloadHash.length).toBe(64);
    });

    it("should fallback gracefully when existing Redis record has corrupted JSON during complete()", async () => {
      mockRedis.store.set(`${IDEMPOTENCY_KEY_PREFIX}${validKey}`, {
        value: "corrupted-json-data",
      });

      await service.complete(validKey, 200, { result: "recovered" });

      const stored = JSON.parse(
        mockRedis.store.get(`${IDEMPOTENCY_KEY_PREFIX}${validKey}`)?.value ??
          "{}",
      ) as { status: string; payloadHash: string };

      expect(stored.status).toBe(IDEMPOTENCY_STATUS.COMPLETED);
      expect(stored.payloadHash).toBe("");
    });
  });

  describe("release", () => {
    it("should delete record from Redis when called so client can retry", async () => {
      await service.acquire(validKey, defaultPayload);
      expect(mockRedis.store.has(`${IDEMPOTENCY_KEY_PREFIX}${validKey}`)).toBe(
        true,
      );

      await service.release(validKey);
      expect(mockRedis.store.has(`${IDEMPOTENCY_KEY_PREFIX}${validKey}`)).toBe(
        false,
      );
    });

    it("should not throw on complete() or release() when Redis is down", async () => {
      mockRedis.setThrow(true);

      await service.complete(validKey, 200, { result: "ok" });
      await service.release(validKey);
    });
  });
});
