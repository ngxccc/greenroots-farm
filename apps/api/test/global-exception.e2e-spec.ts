import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import request from "supertest";
import { type INestApplication } from "@nestjs/common";
import type { Server } from "node:http";
import {
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "./helpers/app.helper";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";

describe("GlobalExceptionFilter Pipeline E2E", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  const getHttpServer = (): Server => app.getHttpServer() as Server;

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  describe("when handling DTO validation failures", () => {
    it("should return RFC 9457 formatted 400 Bad Request with application/problem+json on invalid media upload payload", async () => {
      const res = await request(getHttpServer())
        .post("/api/v1/media/upload-signature")
        .send({
          folder: "invalid_unknown_folder",
          resourceType: "unsupported_type",
          fileSizeBytes: -100,
        })
        .expect(400);

      expect(res.headers["content-type"]).toContain("application/problem+json");

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.title).toBe("Bad Request");
      expect(body.status).toBe(400);
      expect(body.instance).toBe("/api/v1/media/upload-signature");
      expect(body.type).toBe("/errors/bad-request");
      expect(Array.isArray(body.invalidParams)).toBe(true);
      expect(body.invalidParams.length).toBeGreaterThan(0);
      expect(body.invalidParams[0]).toHaveProperty("name");
      expect(body.invalidParams[0]).toHaveProperty("reason");
    });
  });

  describe("when handling 404 Not Found routes", () => {
    it("should return RFC 9457 formatted 404 Not Found with application/problem+json", async () => {
      const res = await request(getHttpServer())
        .get("/api/v1/non-existent-route-xyz")
        .expect(404);

      expect(res.headers["content-type"]).toContain("application/problem+json");

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.title).toBe("Not Found");
      expect(body.status).toBe(404);
      expect(body.instance).toBe("/api/v1/non-existent-route-xyz");
      expect(body.type).toBe("/errors/not-found");
    });
  });

  describe("when handling health endpoint", () => {
    it("should return 200 OK with apiSuccess envelope", async () => {
      const res = await request(getHttpServer())
        .get("/api/v1/health")
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("ok");
    });
  });
});
