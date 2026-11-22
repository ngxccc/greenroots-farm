import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import request from "supertest";
import { type INestApplication } from "@nestjs/common";
import type { OpenAPIObject } from "@nestjs/swagger";
import {
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "./helpers/app.helper";
import { setupOpenApiAndScalar } from "@/common/config/openapi.config";

describe("OpenAPI Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;

  beforeAll(async () => {
    setup = await createTestApp({
      configureApp: (instance) => {
        setupOpenApiAndScalar(instance);
      },
    });
    app = setup.app;
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  describe("GET /openapi.json", () => {
    it("returns valid OpenAPI 3.1.0 specification with metadata and security schemes", async () => {
      const res = await request(app.getHttpServer())
        .get("/openapi.json")
        .expect(200);

      expect(res.headers["content-type"]).toContain("application/json");

      const doc = res.body as OpenAPIObject;
      expect(doc.openapi).toBe("3.1.0");
      expect(doc.info.title).toBe("GreenRoots Farm API");
      expect(doc.paths).toBeDefined();
      expect(doc.paths["/api/v1/health"]).toBeDefined();
      expect(doc.paths["/api/v1/media/upload-signature"]).toBeDefined();
      expect(doc.components?.securitySchemes).toHaveProperty("bearer");
    });
  });

  describe("GET /api/docs", () => {
    it("serves Scalar interactive documentation UI", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/docs")
        .expect(200);

      expect(res.headers["content-type"]).toContain("text/html");
      expect(res.text).toContain("Scalar");
    });
  });
});
