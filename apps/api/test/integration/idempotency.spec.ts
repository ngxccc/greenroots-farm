import {
  describe,
  expect,
  it,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import request from "supertest";
import {
  Body,
  Controller,
  type INestApplication,
  InternalServerErrorException,
  Post,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { API_ERROR_CODES } from "@greenroots/shared";
import { Idempotent } from "@/common/decorators/idempotent.decorator";
import { Public } from "@/common/decorators/public.decorator";
import { IDEMPOTENCY_KEY_PREFIX } from "@/common/constants/idempotency.constant";
import { RedisService } from "@/common/services/redis.service";
import { apiSuccess } from "@/common/utils/api-response.util";
import { randomUUID } from "node:crypto";
import {
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "../helpers/app.helper";
import { createAuthenticatedUser } from "../helpers/auth.helper";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";

interface ExecutionGate {
  entered: Promise<void>;
  markEntered: () => void;
  release: Promise<void>;
  resolveRelease: () => void;
}

const executionGates = new Map<string, ExecutionGate>();
const executionCounts = new Map<string, number>();

function createExecutionGate(gateId: string): ExecutionGate {
  let markEntered!: () => void;
  let resolveRelease!: () => void;
  const entered = new Promise<void>((resolve) => {
    markEntered = resolve;
  });
  const release = new Promise<void>((resolve) => {
    resolveRelease = resolve;
  });
  const gate: ExecutionGate = { entered, markEntered, release, resolveRelease };
  executionGates.set(gateId, gate);
  return gate;
}

function recordExecution(trackingId: unknown): void {
  if (typeof trackingId === "string") {
    executionCounts.set(trackingId, (executionCounts.get(trackingId) ?? 0) + 1);
  }
}

@Controller()
class TestIdempotentController {
  @Public()
  @Post("test/idempotent-mutation")
  @Idempotent({ required: true })
  async testMutation(@Body() body: Record<string, unknown>) {
    const gateId = body["gateId"];
    if (typeof gateId === "string") {
      const gate = executionGates.get(gateId);
      if (gate) {
        gate.markEntered();
        await gate.release;
      }
    }

    recordExecution(body["trackingId"] ?? gateId);

    if (body["simulateError"] === true) {
      throw new InternalServerErrorException(
        "Simulated transaction failure to verify idempotency key release.",
      );
    }
    return apiSuccess({
      status: "processed",
      echo: body,
      executionId: randomUUID(),
      processedAt: new Date().toISOString(),
    });
  }

  @Public()
  @Post("test/idempotent-mutation-secondary")
  @Idempotent({ required: true })
  testSecondaryMutation(@Body() body: Record<string, unknown>) {
    return apiSuccess({
      status: "secondary-processed",
      echo: body,
      executionId: randomUUID(),
      processedAt: new Date().toISOString(),
    });
  }

  @Post("test/idempotent-auth-mutation")
  @Idempotent({ required: true })
  testAuthenticatedMutation(@Body() body: Record<string, unknown>) {
    recordExecution(body["trackingId"]);
    return apiSuccess({
      status: "auth-processed",
      echo: body,
      executionId: randomUUID(),
      processedAt: new Date().toISOString(),
    });
  }
}

describe("Idempotency Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;

  beforeAll(async () => {
    setup = await createTestApp({
      controllers: [TestIdempotentController],
    });
    app = setup.app;
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  beforeEach(() => {
    executionGates.clear();
    executionCounts.clear();
  });

  describe("Header Validation", () => {
    it("rejects request when Idempotency-Key header is missing on required endpoint", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .send({ action: "checkout", amount: 150000 })
        .expect(400);

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.status).toBe(400);
      expect(body.type).toBe("/errors/bad-request");
      expect(body.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
    });

    it("rejects request when Idempotency-Key is not a valid UUID format", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", "invalid-non-uuid-key")
        .send({ action: "checkout", amount: 150000 })
        .expect(400);

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.status).toBe(400);
      expect(body.type).toBe("/errors/bad-request");
      expect(body.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
      expect(body.detail).toContain("UUID");
    });
  });

  describe("Cache Replay Consistency within 24h", () => {
    it("processes initial request and returns identical cached response on replay without re-executing", async () => {
      // Invariant: INV-IDEMP-1
      const key = randomUUID();
      const payload = {
        action: "create_order",
        items: [{ id: "prod_1", qty: 2 }],
      };

      const res1 = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", key)
        .send(payload)
        .expect(201);

      expect(res1.body.success).toBe(true);
      expect(res1.body.data.status).toBe("processed");
      const firstExecutionId = res1.body.data.executionId;
      expect(firstExecutionId).toBeDefined();

      const res2 = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", key)
        .send(payload)
        .expect(201);

      expect(res2.body.success).toBe(true);
      expect(res2.body.data.status).toBe("processed");
      expect(res2.body.data.executionId).toBe(firstExecutionId);
    });
  });

  describe("Payload Mismatch Detection", () => {
    it("rejects request when same key is reused with a different body", async () => {
      // Invariant: INV-IDEMP-2
      const key = randomUUID();

      await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", key)
        .send({ orderId: "order_123", amountVnd: 500000 })
        .expect(201);

      const res2 = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", key)
        .send({ orderId: "order_123", amountVnd: 999000 })
        .expect(422);

      const body = res2.body as Rfc9457ProblemDetails;
      expect(body.status).toBe(422);
      expect(body.type).toBe("/errors/unprocessable-entity");
      expect(body.code).toBe(API_ERROR_CODES.UNPROCESSABLE_ENTITY);
      expect(body.detail).toContain("different request payload");
    });
  });

  describe("Error Rollback and Key Release", () => {
    it("releases idempotency key when request fails so subsequent retry succeeds", async () => {
      // Invariant: INV-IDEMP-5
      const key = randomUUID();
      const payload = { test: "rollback", simulateError: true };

      await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", key)
        .send(payload)
        .expect(500);

      const retryRes = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", key)
        .send({ test: "rollback", simulateError: false })
        .expect(201);

      expect(retryRes.body.success).toBe(true);
      expect(retryRes.body.data.status).toBe("processed");
    });
  });

  describe("Route Scoping Isolation", () => {
    it("isolates identical Idempotency-Key across distinct routes", async () => {
      const key = randomUUID();
      const payload = { test: "route-isolation" };

      const primaryRes = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", key)
        .send(payload)
        .expect(201);

      const secondaryRes = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation-secondary")
        .set("Idempotency-Key", key)
        .send(payload)
        .expect(201);

      expect(primaryRes.body.data.status).toBe("processed");
      expect(secondaryRes.body.data.status).toBe("secondary-processed");
      expect(secondaryRes.body.data.executionId).not.toBe(
        primaryRes.body.data.executionId,
      );
    });
  });

  describe("Concurrent In-Flight Contention", () => {
    it("rejects parallel in-flight requests sharing the same key and payload without re-executing", async () => {
      // Invariant: INV-IDEMP-3
      const key = randomUUID();
      const gateId = randomUUID();
      const gate = createExecutionGate(gateId);
      const payload = { gateId, amount: 150000 };

      const firstPromise = request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", key)
        .send(payload)
        .then((res) => res);

      try {
        await gate.entered;

        const contenders = await Promise.all(
          Array.from({ length: 4 }, () =>
            request(app.getHttpServer())
              .post("/api/v1/test/idempotent-mutation")
              .set("Idempotency-Key", key)
              .send(payload),
          ),
        );

        for (const contender of contenders) {
          expect(contender.status).toBe(409);
          const body = contender.body as Rfc9457ProblemDetails;
          expect(body.type).toBe("/errors/conflict");
          expect(body.code).toBe(API_ERROR_CODES.CONFLICT);
        }
      } finally {
        gate.resolveRelease();
      }

      const firstRes = await firstPromise;
      expect(firstRes.status).toBe(201);
      expect(executionCounts.get(gateId)).toBe(1);
    });

    it("rejects parallel in-flight request when key is reused with a different payload", async () => {
      // Invariant: INV-IDEMP-2
      const key = randomUUID();
      const gateId = randomUUID();
      const gate = createExecutionGate(gateId);

      const firstPromise = request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", key)
        .send({ gateId, amount: 150000 })
        .then((res) => res);

      try {
        await gate.entered;

        const mismatchRes = await request(app.getHttpServer())
          .post("/api/v1/test/idempotent-mutation")
          .set("Idempotency-Key", key)
          .send({ gateId, amount: 999000 })
          .expect(422);

        const mismatchBody = mismatchRes.body as Rfc9457ProblemDetails;
        expect(mismatchBody.type).toBe("/errors/unprocessable-entity");
        expect(mismatchBody.code).toBe(API_ERROR_CODES.UNPROCESSABLE_ENTITY);
      } finally {
        gate.resolveRelease();
      }

      const firstRes = await firstPromise;
      expect(firstRes.status).toBe(201);
      expect(executionCounts.get(gateId)).toBe(1);
    });

    it("executes mutation at most once when identical requests race simultaneously", async () => {
      // Invariant: INV-IDEMP-1, INV-IDEMP-3
      const key = randomUUID();
      const trackingId = randomUUID();
      const payload = { trackingId, items: [{ id: "prod_1", qty: 3 }] };

      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          request(app.getHttpServer())
            .post("/api/v1/test/idempotent-mutation")
            .set("Idempotency-Key", key)
            .send(payload),
        ),
      );

      expect(executionCounts.get(trackingId)).toBe(1);

      const created = responses.filter((r) => r.status === 201);
      expect(created.length).toBeGreaterThanOrEqual(1);
      const firstExecutionId = created[0]!.body.data.executionId;
      for (const res of created) {
        expect(res.body.data.executionId).toBe(firstExecutionId);
      }
      for (const res of responses) {
        expect([201, 409]).toContain(res.status);
      }
    });
  });

  describe("Canonical Payload Equivalence", () => {
    it("replays cached response when payload has identical fields in different key order", async () => {
      // Invariant: INV-IDEMP-1
      const key = randomUUID();
      const trackingId = randomUUID();

      const res1 = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", key)
        .send({
          trackingId,
          meta: { b: 2, a: 1 },
          items: [{ qty: 2, id: "prod_1" }],
        })
        .expect(201);

      const res2 = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", key)
        .send({
          items: [{ id: "prod_1", qty: 2 }],
          meta: { a: 1, b: 2 },
          trackingId,
        })
        .expect(201);

      expect(res2.body.data.executionId).toBe(res1.body.data.executionId);
      expect(executionCounts.get(trackingId)).toBe(1);
    });
  });

  describe("User Scoping Isolation", () => {
    it("isolates identical Idempotency-Key across different authenticated users", async () => {
      const jwtService = app.get(JwtService);
      const userA = await createAuthenticatedUser(setup.db, jwtService);
      const userB = await createAuthenticatedUser(setup.db, jwtService);
      const sharedKey = randomUUID();
      const trackingId = randomUUID();
      const payload = { trackingId, action: "user-scoped-mutation" };

      const resA = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-auth-mutation")
        .set(userA.authHeader)
        .set("Idempotency-Key", sharedKey)
        .send(payload)
        .expect(201);

      const resB = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-auth-mutation")
        .set(userB.authHeader)
        .set("Idempotency-Key", sharedKey)
        .send(payload)
        .expect(201);

      expect(resB.body.data.executionId).not.toBe(resA.body.data.executionId);
      expect(executionCounts.get(trackingId)).toBe(2);

      const replayA = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-auth-mutation")
        .set(userA.authHeader)
        .set("Idempotency-Key", sharedKey)
        .send(payload)
        .expect(201);

      expect(replayA.body.data.executionId).toBe(resA.body.data.executionId);
      expect(executionCounts.get(trackingId)).toBe(2);
    });
  });

  describe("Fail-Closed Redis Behavior", () => {
    it("fails closed when Redis set fails during lock acquisition", async () => {
      // Invariant: INV-IDEMP-4
      const redisService = app.get(RedisService);
      const client = redisService.getClient();
      const originalSet = client.set.bind(client);
      client.set = () => Promise.reject(new Error("Redis ECONNREFUSED"));

      try {
        const res = await request(app.getHttpServer())
          .post("/api/v1/test/idempotent-mutation")
          .set("Idempotency-Key", randomUUID())
          .send({ action: "redis-set-failure" })
          .expect(503);

        const body = res.body as Rfc9457ProblemDetails;
        expect(body.type).toBe("/errors/service-unavailable");
        expect(body.code).toBe(API_ERROR_CODES.SERVICE_UNAVAILABLE);
      } finally {
        client.set = originalSet;
      }
    });

    it("fails closed when Redis get fails on existing key lookup", async () => {
      // Invariant: INV-IDEMP-4
      const key = randomUUID();
      const payload = { action: "redis-get-failure" };

      await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", key)
        .send(payload)
        .expect(201);

      const redisService = app.get(RedisService);
      const client = redisService.getClient();
      const originalGet = client.get.bind(client);
      client.get = () => Promise.reject(new Error("Redis GET timeout"));

      try {
        const res = await request(app.getHttpServer())
          .post("/api/v1/test/idempotent-mutation")
          .set("Idempotency-Key", key)
          .send(payload)
          .expect(503);

        const body = res.body as Rfc9457ProblemDetails;
        expect(body.type).toBe("/errors/service-unavailable");
        expect(body.code).toBe(API_ERROR_CODES.SERVICE_UNAVAILABLE);
      } finally {
        client.get = originalGet;
      }
    });

    it("fails closed when stored idempotency record in Redis is corrupted JSON", async () => {
      // Invariant: INV-IDEMP-4
      const key = randomUUID();
      const redisService = app.get(RedisService);
      const client = redisService.getClient();
      const scopedRedisKey = `${IDEMPOTENCY_KEY_PREFIX}anonymous:POST:/api/v1/test/idempotent-mutation:${key}`;

      await client.set(scopedRedisKey, "corrupted-non-json-record", "EX", 60);

      const res = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", key)
        .send({ action: "corrupted-record" })
        .expect(503);

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.type).toBe("/errors/service-unavailable");
      expect(body.code).toBe(API_ERROR_CODES.SERVICE_UNAVAILABLE);
    });
  });
});
