import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import request from "supertest";
import { type INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "../helpers/app.helper";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";

describe("Idempotency Interceptor E2E Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  describe("Header Validation", () => {
    it("should return 400 Bad Request when Idempotency-Key header is missing on required endpoint", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .send({ action: "checkout", amount: 150000 })
        .expect(400);

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.status).toBe(400);
      expect(body.type).toBe("/errors/bad-request");
    });

    it("should return 400 Bad Request when Idempotency-Key is not a valid UUID format", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", "invalid-non-uuid-key")
        .send({ action: "checkout", amount: 150000 })
        .expect(400);

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.status).toBe(400);
      expect(body.type).toBe("/errors/bad-request");
      expect(body.detail).toContain("UUID");
    });
  });

  describe("INV-IDEMP-1: Cache Replay Consistency within 24h", () => {
    it("should process initial request and return identical cached response on replay without re-executing", async () => {
      const key = randomUUID();
      const payload = {
        action: "create_order",
        items: [{ id: "prod_1", qty: 2 }],
      };

      // Call 1: initial execution
      const res1 = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", key)
        .send(payload)
        .expect(201);

      expect(res1.body.success).toBe(true);
      expect(res1.body.data.status).toBe("processed");
      const firstExecutionId = res1.body.data.executionId;
      expect(firstExecutionId).toBeDefined();

      // Call 2: replay with exact same key and body
      const res2 = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", key)
        .send(payload)
        .expect(201);

      expect(res2.body.success).toBe(true);
      expect(res2.body.data.status).toBe("processed");
      // Execution ID must match exactly, proving controller was not re-executed
      expect(res2.body.data.executionId).toBe(firstExecutionId);
    });
  });

  describe("INV-IDEMP-2: Payload Mismatch Detection", () => {
    it("should return 422 Unprocessable Entity when same key is reused with a different body", async () => {
      const key = randomUUID();

      // Call 1 with original payload
      await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", key)
        .send({ orderId: "order_123", amountVnd: 500000 })
        .expect(201);

      // Call 2 with same key but altered payload (amount changed)
      const res2 = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", key)
        .send({ orderId: "order_123", amountVnd: 999000 })
        .expect(422);

      const body = res2.body as Rfc9457ProblemDetails;
      expect(body.status).toBe(422);
      expect(body.type).toBe("/errors/unprocessable-entity");
      expect(body.detail).toContain("nội dung yêu cầu khác");
    });
  });

  describe("INV-IDEMP-5: Error Rollback and Key Release", () => {
    it("should release idempotency key when request fails, allowing subsequent retry", async () => {
      const key = randomUUID();
      const payload = { test: "rollback", simulateError: true };

      // Call 1: simulated server error
      await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", key)
        .send(payload)
        .expect(500);

      // Call 2: retry with error removed should succeed because key was released
      const retryRes = await request(app.getHttpServer())
        .post("/api/v1/test/idempotent-mutation")
        .set("Idempotency-Key", key)
        .send({ test: "rollback", simulateError: false })
        .expect(201);

      expect(retryRes.body.success).toBe(true);
      expect(retryRes.body.data.status).toBe("processed");
    });
  });
});
