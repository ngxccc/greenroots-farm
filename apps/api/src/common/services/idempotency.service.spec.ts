import { describe, expect, it } from "bun:test";
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { IdempotencyService } from "./idempotency.service";
import type { RedisService } from "./redis.service";

describe("IdempotencyService Integration", () => {
  function createMockRedis() {
    const store = new Map<string, { value: string; ttl?: number }>();
    let throwOnOperation = false;

    return {
      store,
      setThrow(val: boolean) {
        throwOnOperation = val;
      },
      client: {
        get(key: string) {
          if (throwOnOperation) {
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
          if (flag === "NX" && store.has(key)) {
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

  it("should acquire lock with PROCESSING status on first request (INV-IDEMP-1)", async () => {
    const mockRedis = createMockRedis();
    const service = new IdempotencyService({
      getClient: () => mockRedis.client,
    } as unknown as RedisService);

    const validKey = "019318b7-657d-7848-8df0-e374528148b1";
    const body = { items: [{ id: "prod-1", quantity: 2 }] };

    const result = await service.acquire(validKey, body);

    expect(result.isNew).toBe(true);
    expect(result.cached).toBeNull();

    // Verify stored state in Redis
    const stored = JSON.parse(
      mockRedis.store.get(`idempotency:${validKey}`)?.value ?? "{}",
    ) as { status: string; payloadHash: string };
    expect(stored.status).toBe("PROCESSING");
    expect(stored.payloadHash).toBeDefined();
  });

  it("should return cached COMPLETED response on replay with identical payload (INV-IDEMP-1)", async () => {
    const mockRedis = createMockRedis();
    const service = new IdempotencyService({
      getClient: () => mockRedis.client,
    } as unknown as RedisService);

    const validKey = "019318b7-657d-7848-8df0-e374528148b1";
    const body = { items: [{ id: "prod-1", quantity: 2 }] };

    await service.acquire(validKey, body);
    await service.complete(validKey, 201, { orderId: "order-123" });

    // Replay with identical payload (different key order to test canonical JSON)
    const replayBody = { items: [{ quantity: 2, id: "prod-1" }] };
    const replayResult = await service.acquire(validKey, replayBody);

    expect(replayResult.isNew).toBe(false);
    expect(replayResult.cached).toEqual({
      statusCode: 201,
      body: { orderId: "order-123" },
    });
  });

  it("should reject with 422 Unprocessable Entity when payload differs (INV-IDEMP-2)", async () => {
    const mockRedis = createMockRedis();
    const service = new IdempotencyService({
      getClient: () => mockRedis.client,
    } as unknown as RedisService);

    const validKey = "019318b7-657d-7848-8df0-e374528148b1";
    await service.acquire(validKey, { amount: 1000 });
    await service.complete(validKey, 200, { success: true });

    let thrownError: unknown;
    try {
      await service.acquire(validKey, { amount: 2000 });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(UnprocessableEntityException);
  });

  it("should reject with 409 Conflict when request is still PROCESSING (INV-IDEMP-3)", async () => {
    const mockRedis = createMockRedis();
    const service = new IdempotencyService({
      getClient: () => mockRedis.client,
    } as unknown as RedisService);

    const validKey = "019318b7-657d-7848-8df0-e374528148b1";
    await service.acquire(validKey, { test: 1 });

    let thrownError: unknown;
    try {
      await service.acquire(validKey, { test: 1 });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(ConflictException);
  });

  it("should fail-closed with 503 Service Unavailable when Redis is down (INV-IDEMP-4)", async () => {
    const mockRedis = createMockRedis();
    const service = new IdempotencyService({
      getClient: () => mockRedis.client,
    } as unknown as RedisService);

    mockRedis.setThrow(true);

    const validKey = "019318b7-657d-7848-8df0-e374528148b1";
    let thrownError: unknown;
    try {
      await service.acquire(validKey, { test: 1 });
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(ServiceUnavailableException);
  });

  it("should release key on failure so client can retry (INV-IDEMP-5)", async () => {
    const mockRedis = createMockRedis();
    const service = new IdempotencyService({
      getClient: () => mockRedis.client,
    } as unknown as RedisService);

    const validKey = "019318b7-657d-7848-8df0-e374528148b1";
    await service.acquire(validKey, { test: 1 });
    expect(mockRedis.store.has(`idempotency:${validKey}`)).toBe(true);

    await service.release(validKey);
    expect(mockRedis.store.has(`idempotency:${validKey}`)).toBe(false);
  });

  it("should reject with 400 Bad Request when Idempotency-Key is not a valid UUID", async () => {
    const mockRedis = createMockRedis();
    const service = new IdempotencyService({
      getClient: () => mockRedis.client,
    } as unknown as RedisService);

    let thrownError: unknown;
    try {
      await service.acquire("invalid-not-a-uuid", {});
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(BadRequestException);
  });
});
