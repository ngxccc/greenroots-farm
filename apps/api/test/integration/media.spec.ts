import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import request from "supertest";
import { type INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "../helpers/app.helper";
import {
  createAuthenticatedAdmin,
  createAuthenticatedUser,
} from "../helpers/auth.helper";
import { API_ERROR_CODES } from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import type {
  InvalidParam,
  Rfc9457ProblemDetails,
} from "@/common/filters/global-exception.filter";
import type { ApiResponse } from "@/common/utils/api-response.util";
import { MEDIA_CONSTRAINTS } from "@/modules/media/media.constant";
import type { CloudinarySignatureResult } from "@/modules/media/media.interface";

describe("Media Module Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let customerHeader: { Authorization: string };
  let adminHeader: { Authorization: string };

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    const jwtService = app.get(JwtService);
    const customerSession = await createAuthenticatedUser(setup.db, jwtService);
    customerHeader = customerSession.authHeader;

    const adminSession = await createAuthenticatedAdmin(setup.db, jwtService);
    adminHeader = adminSession.authHeader;
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  describe("POST /api/v1/media/upload-signature (authenticated)", () => {
    it("should reject with 401 Unauthorized when request is unauthenticated", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .send({
          folder: "farming_logs",
          resourceType: "image",
          fileSizeBytes: 1024,
        })
        .expect(401);

      expect(res.headers["content-type"]).toContain("application/problem+json");

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.status).toBe(401);
      expect(body.title).toBe("Unauthorized");
      expect(body.type).toBe("/errors/unauthorized");
      expect(body.instance).toBe("/api/v1/media/upload-signature");
    });

    it("should reject with 403 Forbidden when CUSTOMER requests signature for farming_logs", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .set(customerHeader)
        .send({
          folder: "farming_logs",
          resourceType: "image",
          fileSizeBytes: 1024,
        })
        .expect(403);

      expect(res.headers["content-type"]).toContain("application/problem+json");

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.status).toBe(403);
      expect(body.title).toBe("Forbidden");
      expect(body.type).toBe("/errors/forbidden");
      expect(body.code).toBe(API_ERROR_CODES.FORBIDDEN);
      expect(body.instance).toBe("/api/v1/media/upload-signature");
      expect(body.detail).toBe(MESSAGES.MEDIA.FOLDER_ACCESS_DENIED);
    });

    it("should reject with 403 Forbidden when CUSTOMER requests signature for products", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .set(customerHeader)
        .send({
          folder: "products",
          resourceType: "image",
          fileSizeBytes: 1024,
        })
        .expect(403);

      expect(res.headers["content-type"]).toContain("application/problem+json");

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.status).toBe(403);
      expect(body.title).toBe("Forbidden");
      expect(body.type).toBe("/errors/forbidden");
      expect(body.code).toBe(API_ERROR_CODES.FORBIDDEN);
      expect(body.instance).toBe("/api/v1/media/upload-signature");
      expect(body.detail).toBe(MESSAGES.MEDIA.FOLDER_ACCESS_DENIED);
    });

    it("should generate valid signed upload parameters when admin requests farming_logs under 5MB limit", async () => {
      const validImageBytes = MEDIA_CONSTRAINTS.IMAGE.MAX_BYTES - 1024 * 512;

      const res = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .set(adminHeader)
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

    it("should generate valid signed upload parameters when admin requests products folder", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .set(adminHeader)
        .send({
          folder: "products",
          resourceType: "image",
          fileSizeBytes: 2048,
        })
        .expect(200);

      expect(res.headers["content-type"]).toContain("application/json");

      const body = res.body as ApiResponse<CloudinarySignatureResult>;
      expect(body.success).toBe(true);
      expect(body.data.folder).toBe("products");
    });

    it("generates signed upload parameters for plots as farm staff and rejects farms folder", async () => {
      const jwtService = app.get(JwtService);
      const farmStaffSession = await createAuthenticatedAdmin(
        setup.db,
        jwtService,
        "farm_staff" as never,
      );

      const plotsRes = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .set(farmStaffSession.authHeader)
        .send({
          folder: "plots",
          resourceType: "image",
          fileSizeBytes: 2048,
        })
        .expect(200);

      const plotsBody = plotsRes.body as ApiResponse<CloudinarySignatureResult>;
      expect(plotsBody.data.folder).toBe("plots");

      const farmsDeniedRes = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .set(farmStaffSession.authHeader)
        .send({
          folder: "farms",
          resourceType: "image",
          fileSizeBytes: 2048,
        })
        .expect(403);

      const farmsDeniedBody = farmsDeniedRes.body as Rfc9457ProblemDetails;
      expect(farmsDeniedBody.detail).toBe(MESSAGES.MEDIA.FOLDER_ACCESS_DENIED);
    });

    it("generates signed upload parameters for farms folder as admin", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .set(adminHeader)
        .send({
          folder: "farms",
          resourceType: "image",
          fileSizeBytes: 2048,
        })
        .expect(200);

      const body = res.body as ApiResponse<CloudinarySignatureResult>;
      expect(body.success).toBe(true);
      expect(body.data.folder).toBe("farms");

      await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .set(adminHeader)
        .send({
          folder: "farms",
          resourceType: "video",
          fileSizeBytes: 2048,
        })
        .expect(400);

      await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .set(adminHeader)
        .send({
          folder: "plots",
          resourceType: "video",
          fileSizeBytes: 2048,
        })
        .expect(400);

      await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .set(adminHeader)
        .send({
          folder: "products",
          resourceType: "video",
          fileSizeBytes: 2048,
        })
        .expect(400);
    });

    it("should reject with 422 Unprocessable Entity when image exceeds 5MB", async () => {
      const oversizedImageBytes = MEDIA_CONSTRAINTS.IMAGE.MAX_BYTES + 1;

      const res = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .set(adminHeader)
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
      expect(body.code).toBe(API_ERROR_CODES.UNPROCESSABLE_ENTITY);
      expect(body.instance).toBe("/api/v1/media/upload-signature");
      expect(body.detail).toContain("5MB");
    });

    it("should generate valid signed upload parameters when customer uploads to complaints under 15MB limit", async () => {
      const validVideoBytes = MEDIA_CONSTRAINTS.VIDEO.MAX_BYTES - 1024 * 1024;

      const res = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .set(customerHeader)
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
        .set(customerHeader)
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
      expect(body.code).toBe(API_ERROR_CODES.UNPROCESSABLE_ENTITY);
      expect(body.instance).toBe("/api/v1/media/upload-signature");
      expect(body.detail).toContain("15MB");
    });

    it("should return 400 Bad Request when folder is not in whitelist", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .set(customerHeader)
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
        body.invalidParams.some((p: InvalidParam) => p.name === "folder"),
      ).toBe(true);
    });

    it("should return 400 Bad Request when resourceType is not supported", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .set(adminHeader)
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
        body.invalidParams.some((p: InvalidParam) => p.name === "resourceType"),
      ).toBe(true);
    });

    it("should return 400 Bad Request when fileSizeBytes is zero or negative", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/media/upload-signature")
        .set(adminHeader)
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
        body.invalidParams.some(
          (p: InvalidParam) => p.name === "fileSizeBytes",
        ),
      ).toBe(true);
    });
  });
});
