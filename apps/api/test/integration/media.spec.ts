import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import request from "supertest";
import { type INestApplication } from "@nestjs/common";
import {
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "../helpers/app.helper";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";

describe("Cloudinary Media Signed Upload E2E Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  describe("POST /api/v1/media/upload-signature", () => {
    describe("Image Constraints (<= 5MB)", () => {
      it("should generate valid signed upload parameters for image under 5MB", async () => {
        const res = await request(app.getHttpServer())
          .post("/api/v1/media/upload-signature")
          .send({
            folder: "farming_logs",
            resourceType: "image",
            fileSizeBytes: 4.5 * 1024 * 1024,
          })
          .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.signature).toBeDefined();
        expect(res.body.data.timestamp).toBeGreaterThan(0);
        expect(res.body.data.folder).toBe("farming_logs");
        expect(res.body.data.cloudName).toBeDefined();
      });

      it("should reject image exceeding 5MB with 422 Unprocessable Entity (INV-MEDIA-1)", async () => {
        const res = await request(app.getHttpServer())
          .post("/api/v1/media/upload-signature")
          .send({
            folder: "farming_logs",
            resourceType: "image",
            fileSizeBytes: 5.5 * 1024 * 1024,
          })
          .expect(422);

        const body = res.body as Rfc9457ProblemDetails;
        expect(body.status).toBe(422);
        expect(body.type).toBe("/errors/unprocessable-entity");
        expect(body.detail).toContain("5MB");
      });
    });

    describe("Video Constraints (<= 15MB)", () => {
      it("should generate valid signed upload parameters for video under 15MB", async () => {
        const res = await request(app.getHttpServer())
          .post("/api/v1/media/upload-signature")
          .send({
            folder: "complaints",
            resourceType: "video",
            fileSizeBytes: 14 * 1024 * 1024,
          })
          .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.signature).toBeDefined();
        expect(res.body.data.folder).toBe("complaints");
      });

      it("should reject video exceeding 15MB with 422 Unprocessable Entity (INV-MEDIA-1)", async () => {
        const res = await request(app.getHttpServer())
          .post("/api/v1/media/upload-signature")
          .send({
            folder: "complaints",
            resourceType: "video",
            fileSizeBytes: 16 * 1024 * 1024,
          })
          .expect(422);

        const body = res.body as Rfc9457ProblemDetails;
        expect(body.status).toBe(422);
        expect(body.type).toBe("/errors/unprocessable-entity");
        expect(body.detail).toContain("15MB");
      });
    });

    describe("Validation Errors", () => {
      it("should return 400 Bad Request when folder is not in whitelist", async () => {
        const res = await request(app.getHttpServer())
          .post("/api/v1/media/upload-signature")
          .send({
            folder: "hacked_folder_root",
            resourceType: "image",
            fileSizeBytes: 1024,
          })
          .expect(400);

        const body = res.body as Rfc9457ProblemDetails;
        expect(body.status).toBe(400);
        expect(body.type).toBe("/errors/bad-request");
      });
    });
  });
});
