import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import request from "supertest";
import { type INestApplication } from "@nestjs/common";
import {
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "../helpers/app.helper";
import type {
  InvalidParam,
  Rfc9457ProblemDetails,
} from "@/common/filters/global-exception.filter";
import type { ApiResponse } from "@/common/utils/api-response.util";
import {
  MEDIA_CONSTRAINTS,
  type CloudinarySignatureResult,
} from "@/modules/media/media.interface";

describe("Media Module Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  describe("POST /api/v1/media/upload-signature (public)", () => {
    it("should generate valid signed upload parameters when image is under 5MB limit", async () => {
      const validImageBytes = MEDIA_CONSTRAINTS.IMAGE.MAX_BYTES - 1024 * 512;

      const res = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .send({
          folder: "farming_logs",
          resourceType: "image",
          fileSizeBytes: validImageBytes,
        })
        .expect(200);

      expect(res.headers["content-type"]).toContain("application/json");

      const body = res.body as ApiResponse<CloudinarySignatureResult>;
      expect(body.success).toBe(true);
      expect(body.data.signature).toBeDefined();
      expect(body.data.timestamp).toBeGreaterThan(0);
      expect(body.data.folder).toBe("farming_logs");
      expect(body.data.resourceType).toBe("image");
      expect(body.data.cloudName).toBeDefined();
      expect(body.data.maxBytes).toBe(MEDIA_CONSTRAINTS.IMAGE.MAX_BYTES);
    });

    it("should reject with 422 Unprocessable Entity when image exceeds 5MB", async () => {
      const oversizedImageBytes = MEDIA_CONSTRAINTS.IMAGE.MAX_BYTES + 1;

      const res = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .send({
          folder: "farming_logs",
          resourceType: "image",
          fileSizeBytes: oversizedImageBytes,
        })
        .expect(422);

      expect(res.headers["content-type"]).toContain("application/problem+json");

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.status).toBe(422);
      expect(body.title).toBe("Unprocessable Entity");
      expect(body.type).toBe("/errors/unprocessable-entity");
      expect(body.instance).toBe("/api/v1/media/upload-signature");
      expect(body.detail).toContain("5MB");
    });

    it("should generate valid signed upload parameters when video is under 15MB limit", async () => {
      const validVideoBytes = MEDIA_CONSTRAINTS.VIDEO.MAX_BYTES - 1024 * 1024;

      const res = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .send({
          folder: "complaints",
          resourceType: "video",
          fileSizeBytes: validVideoBytes,
        })
        .expect(200);

      expect(res.headers["content-type"]).toContain("application/json");

      const body = res.body as ApiResponse<CloudinarySignatureResult>;
      expect(body.success).toBe(true);
      expect(body.data.signature).toBeDefined();
      expect(body.data.folder).toBe("complaints");
      expect(body.data.resourceType).toBe("video");
      expect(body.data.maxBytes).toBe(MEDIA_CONSTRAINTS.VIDEO.MAX_BYTES);
    });

    it("should reject with 422 Unprocessable Entity when video exceeds 15MB", async () => {
      const oversizedVideoBytes = MEDIA_CONSTRAINTS.VIDEO.MAX_BYTES + 1;

      const res = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .send({
          folder: "complaints",
          resourceType: "video",
          fileSizeBytes: oversizedVideoBytes,
        })
        .expect(422);

      expect(res.headers["content-type"]).toContain("application/problem+json");

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.status).toBe(422);
      expect(body.title).toBe("Unprocessable Entity");
      expect(body.type).toBe("/errors/unprocessable-entity");
      expect(body.instance).toBe("/api/v1/media/upload-signature");
      expect(body.detail).toContain("15MB");
    });

    it("should return 400 Bad Request when folder is not in whitelist", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .send({
          folder: "hacked_folder_root",
          resourceType: "image",
          fileSizeBytes: 1024,
        })
        .expect(400);

      expect(res.headers["content-type"]).toContain("application/problem+json");

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.status).toBe(400);
      expect(body.title).toBe("Bad Request");
      expect(body.type).toBe("/errors/bad-request");
      expect(body.instance).toBe("/api/v1/media/upload-signature");
      expect(Array.isArray(body.invalidParams)).toBe(true);
      expect(
        body.invalidParams?.some((p: InvalidParam) => p.name === "folder"),
      ).toBe(true);
    });

    it("should return 400 Bad Request when resourceType is not supported", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .send({
          folder: "farming_logs",
          resourceType: "audio",
          fileSizeBytes: 1024,
        })
        .expect(400);

      expect(res.headers["content-type"]).toContain("application/problem+json");

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.status).toBe(400);
      expect(body.title).toBe("Bad Request");
      expect(body.type).toBe("/errors/bad-request");
      expect(body.instance).toBe("/api/v1/media/upload-signature");
      expect(Array.isArray(body.invalidParams)).toBe(true);
      expect(
        body.invalidParams?.some(
          (p: InvalidParam) => p.name === "resourceType",
        ),
      ).toBe(true);
    });

    it("should return 400 Bad Request when fileSizeBytes is zero or negative", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .send({
          folder: "farming_logs",
          resourceType: "image",
          fileSizeBytes: -100,
        })
        .expect(400);

      expect(res.headers["content-type"]).toContain("application/problem+json");

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.status).toBe(400);
      expect(body.title).toBe("Bad Request");
      expect(body.type).toBe("/errors/bad-request");
      expect(body.instance).toBe("/api/v1/media/upload-signature");
      expect(Array.isArray(body.invalidParams)).toBe(true);
      expect(
        body.invalidParams?.some(
          (p: InvalidParam) => p.name === "fileSizeBytes",
        ),
      ).toBe(true);
    });
  });
});
