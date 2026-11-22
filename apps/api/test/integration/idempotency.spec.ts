import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import request from "supertest";
import {
  Body,
  Controller,
  type INestApplication,
  InternalServerErrorException,
  Post,
} from "@nestjs/common";
import { API_ERROR_CODES } from "@greenroots/shared";
import { Idempotent } from "@/common/decorators/idempotent.decorator";
import { Public } from "@/common/decorators/public.decorator";
import { apiSuccess } from "@/common/utils/api-response.util";
import { randomUUID } from "node:crypto";
import {
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "../helpers/app.helper";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";

@Public()
@Controller()
class TestIdempotentController {
  @Post("test/idempotent-mutation")
  @Idempotent({ required: true })
  testMutation(@Body() body: Record<string, unknown>) {
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
});
