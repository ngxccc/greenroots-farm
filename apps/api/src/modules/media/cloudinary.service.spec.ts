import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  mock,
  spyOn,
  setSystemTime,
} from "bun:test";
import {
  ForbiddenException,
  Logger,
  UnprocessableEntityException,
} from "@nestjs/common";
import { API_ERROR_CODES, UserRole } from "@greenroots/shared";
import { CloudinaryService } from "./cloudinary.service";
import { signedUploadSchema } from "./dto/signed-upload.dto";
import { MEDIA_CONSTRAINTS } from "./media.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import { env } from "@/common/config/env.config";

describe("CloudinaryService", () => {
  const FIXED_EPOCH_SECONDS = 1700000000;
  const FIXED_EPOCH_MS = FIXED_EPOCH_SECONDS * 1000;

  const TEST_CONFIG = {
    API_KEY: "test-api-key-xyz",
    API_SECRET: "test-api-secret-1234567890",
    CLOUD_NAME: "greenroots-test",
  } as const;

  // Ground truth hashes precomputed independently from Cloudinary signing specification:
  // SHA-256(folder=farming_logs&timestamp=1700000000test-api-secret-1234567890)
  const EXPECTED_IMAGE_SIGNATURE =
    "ac802c871d0e4cb333d8d21ff9e35252b6e8b96eebf11b7d37dde6a4d7c05158";

  // SHA-256(folder=complaints&timestamp=1700000000test-api-secret-1234567890)
  const EXPECTED_VIDEO_SIGNATURE =
    "ac6a3ea19df18adc64acab9b2754d07554d6cda9c71caa7a3d00c808860478a1";

  const originalEnv = {
    mediaDriver: env.MEDIA_DRIVER,
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
    cloudName: env.CLOUDINARY_CLOUD_NAME,
  };

  let service: CloudinaryService;
  let warnSpy: ReturnType<typeof spyOn>;
  let errorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    setSystemTime(new Date(FIXED_EPOCH_MS));

    warnSpy = spyOn(Logger.prototype, "warn").mockImplementation(
      () => undefined,
    );
    errorSpy = spyOn(Logger.prototype, "error").mockImplementation(
      () => undefined,
    );

    const envRecord = env as Record<string, unknown>;
    envRecord["MEDIA_DRIVER"] = "cloudinary";
    envRecord["CLOUDINARY_API_KEY"] = TEST_CONFIG.API_KEY;
    envRecord["CLOUDINARY_API_SECRET"] = TEST_CONFIG.API_SECRET;
    envRecord["CLOUDINARY_CLOUD_NAME"] = TEST_CONFIG.CLOUD_NAME;

    service = new CloudinaryService();
  });

  afterEach(() => {
    setSystemTime();
    warnSpy.mockRestore();
    errorSpy.mockRestore();

    const envRecord = env as Record<string, unknown>;
    envRecord["MEDIA_DRIVER"] = originalEnv.mediaDriver;
    envRecord["CLOUDINARY_API_KEY"] = originalEnv.apiKey;
    envRecord["CLOUDINARY_API_SECRET"] = originalEnv.apiSecret;
    envRecord["CLOUDINARY_CLOUD_NAME"] = originalEnv.cloudName;
  });

  describe("createUploadSignature", () => {
    it("generates signed upload signature when image file size is within 5MB limit", () => {
      const result = service.createUploadSignature({
        resourceType: "image",
        fileSizeBytes: MEDIA_CONSTRAINTS.IMAGE.MAX_BYTES,
        folder: "farming_logs",
      });

      expect(result).toEqual({
        signature: EXPECTED_IMAGE_SIGNATURE,
        timestamp: FIXED_EPOCH_SECONDS,
        apiKey: TEST_CONFIG.API_KEY,
        cloudName: TEST_CONFIG.CLOUD_NAME,
        folder: "farming_logs",
        resourceType: "image",
        maxBytes: 5 * 1024 * 1024,
      });
    });

    it("generates signed upload signature when video file size is within 15MB limit", () => {
      const result = service.createUploadSignature({
        resourceType: "video",
        fileSizeBytes: MEDIA_CONSTRAINTS.VIDEO.MAX_BYTES,
        folder: "complaints",
      });

      expect(result).toEqual({
        signature: EXPECTED_VIDEO_SIGNATURE,
        timestamp: FIXED_EPOCH_SECONDS,
        apiKey: TEST_CONFIG.API_KEY,
        cloudName: TEST_CONFIG.CLOUD_NAME,
        folder: "complaints",
        resourceType: "video",
        maxBytes: 15 * 1024 * 1024,
      });
    });

    it("rejects request when image exceeds 5MB", () => {
      const oversizedImageBytes = MEDIA_CONSTRAINTS.IMAGE.MAX_BYTES + 1;

      expect(() =>
        service.createUploadSignature({
          resourceType: "image",
          fileSizeBytes: oversizedImageBytes,
          folder: "products",
        }),
      ).toThrow(UnprocessableEntityException);
    });

    it("rejects request when video exceeds 15MB", () => {
      const oversizedVideoBytes = MEDIA_CONSTRAINTS.VIDEO.MAX_BYTES + 1;

      expect(() =>
        service.createUploadSignature({
          resourceType: "video",
          fileSizeBytes: oversizedVideoBytes,
          folder: "complaints",
        }),
      ).toThrow(UnprocessableEntityException);
    });

    it("generates mock signature when API secret is not configured", () => {
      (env as Record<string, unknown>)["CLOUDINARY_API_SECRET"] = undefined;

      const result = service.createUploadSignature({
        resourceType: "image",
        fileSizeBytes: 1024,
        folder: "products",
      });

      expect(result).toEqual({
        signature: `mock-signature-${FIXED_EPOCH_SECONDS}`,
        timestamp: FIXED_EPOCH_SECONDS,
        apiKey: TEST_CONFIG.API_KEY,
        cloudName: TEST_CONFIG.CLOUD_NAME,
        folder: "products",
        resourceType: "image",
        maxBytes: 5 * 1024 * 1024,
      });
    });
  });

  describe("folder-to-role permissions", () => {
    it("permits CUSTOMER to request signature for complaints folder", () => {
      const result = service.createUploadSignature(
        {
          resourceType: "image",
          fileSizeBytes: 1024,
          folder: "complaints",
        },
        UserRole.CUSTOMER,
      );

      expect(result.folder).toBe("complaints");
    });

    it("forbids CUSTOMER from requesting signature for products folder", () => {
      expect(() =>
        service.createUploadSignature(
          {
            resourceType: "image",
            fileSizeBytes: 1024,
            folder: "products",
          },
          UserRole.CUSTOMER,
        ),
      ).toThrow(
        new ForbiddenException({
          code: API_ERROR_CODES.FORBIDDEN,
          detail: MESSAGES.MEDIA.FOLDER_ACCESS_DENIED,
        }),
      );
    });

    it("forbids CUSTOMER from requesting signature for farming_logs folder", () => {
      expect(() =>
        service.createUploadSignature(
          {
            resourceType: "image",
            fileSizeBytes: 1024,
            folder: "farming_logs",
          },
          UserRole.CUSTOMER,
        ),
      ).toThrow(
        new ForbiddenException({
          code: API_ERROR_CODES.FORBIDDEN,
          detail: MESSAGES.MEDIA.FOLDER_ACCESS_DENIED,
        }),
      );
    });

    it("permits FARM_STAFF for farming_logs and waste_logs, and forbids products", () => {
      const farmResult = service.createUploadSignature(
        {
          resourceType: "image",
          fileSizeBytes: 1024,
          folder: "farming_logs",
        },
        UserRole.FARM_STAFF,
      );
      expect(farmResult.folder).toBe("farming_logs");

      const wasteResult = service.createUploadSignature(
        {
          resourceType: "image",
          fileSizeBytes: 1024,
          folder: "waste_logs",
        },
        UserRole.FARM_STAFF,
      );
      expect(wasteResult.folder).toBe("waste_logs");

      expect(() =>
        service.createUploadSignature(
          {
            resourceType: "image",
            fileSizeBytes: 1024,
            folder: "products",
          },
          UserRole.FARM_STAFF,
        ),
      ).toThrow(
        new ForbiddenException({
          code: API_ERROR_CODES.FORBIDDEN,
          detail: MESSAGES.MEDIA.FOLDER_ACCESS_DENIED,
        }),
      );

      const plotsResult = service.createUploadSignature(
        {
          resourceType: "image",
          fileSizeBytes: 1024,
          folder: "plots",
        },
        UserRole.FARM_STAFF,
      );
      expect(plotsResult.folder).toBe("plots");

      expect(() =>
        service.createUploadSignature(
          {
            resourceType: "image",
            fileSizeBytes: 1024,
            folder: "farms",
          },
          UserRole.FARM_STAFF,
        ),
      ).toThrow(
        new ForbiddenException({
          code: API_ERROR_CODES.FORBIDDEN,
          detail: MESSAGES.MEDIA.FOLDER_ACCESS_DENIED,
        }),
      );
    });

    it("permits SALES for products, and forbids farming_logs", () => {
      const result = service.createUploadSignature(
        {
          resourceType: "image",
          fileSizeBytes: 1024,
          folder: "products",
        },
        UserRole.SALES,
      );
      expect(result.folder).toBe("products");

      expect(() =>
        service.createUploadSignature(
          {
            resourceType: "image",
            fileSizeBytes: 1024,
            folder: "farming_logs",
          },
          UserRole.SALES,
        ),
      ).toThrow(
        new ForbiddenException({
          code: API_ERROR_CODES.FORBIDDEN,
          detail: MESSAGES.MEDIA.FOLDER_ACCESS_DENIED,
        }),
      );
    });

    it("permits ADMIN and SUPER_ADMIN for all folders", () => {
      const folders = [
        "farming_logs",
        "complaints",
        "products",
        "waste_logs",
        "plots",
        "farms",
      ] as const;

      for (const folder of folders) {
        const adminResult = service.createUploadSignature(
          { resourceType: "image", fileSizeBytes: 1024, folder },
          UserRole.ADMIN,
        );
        expect(adminResult.folder).toBe(folder);

        const superAdminResult = service.createUploadSignature(
          { resourceType: "image", fileSizeBytes: 1024, folder },
          UserRole.SUPER_ADMIN,
        );
        expect(superAdminResult.folder).toBe(folder);
      }
    });

    it("rejects video uploads for image-only waste_logs folder via signedUploadSchema", () => {
      const result = signedUploadSchema.safeParse({
        resourceType: "video",
        fileSizeBytes: 1024,
        folder: "waste_logs",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("verifyComplaintMedia", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("skips remote verification when CLOUDINARY_API_SECRET is not configured", async () => {
      (env as Record<string, unknown>)["CLOUDINARY_API_SECRET"] = undefined;
      const fetchMock = mock(() =>
        Promise.reject(new Error("Should not call fetch")),
      );
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await service.verifyComplaintMedia(
        [
          `https://res.cloudinary.com/${TEST_CONFIG.CLOUD_NAME}/image/upload/v1/complaints/a.webp`,
        ],
        `https://res.cloudinary.com/${TEST_CONFIG.CLOUD_NAME}/video/upload/v1/complaints/v.mp4`,
      );

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("accepts valid image and video metadata from Cloudinary Admin API", async () => {
      const fetchMock = mock((url: string) => {
        if (url.includes("/resources/image/upload/")) {
          return Promise.resolve(
            new Response(JSON.stringify({ bytes: 2 * 1024 * 1024 }), {
              status: 200,
            }),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({ bytes: 10 * 1024 * 1024, duration: 14.5 }),
            { status: 200 },
          ),
        );
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      await service.verifyComplaintMedia(
        [
          `https://res.cloudinary.com/${TEST_CONFIG.CLOUD_NAME}/image/upload/v1/complaints/a.webp`,
        ],
        `https://res.cloudinary.com/${TEST_CONFIG.CLOUD_NAME}/video/upload/v1/complaints/v.mp4`,
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const calledUrls = fetchMock.mock.calls.map(
        (call) => (call as unknown[])[0] as string,
      );
      expect(calledUrls[0]).toContain("/resources/image/upload/complaints/a");
      expect(calledUrls[1]).toContain("/resources/video/upload/complaints/v");
    });

    it("rejects video exceeding 15 seconds duration", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ bytes: 5 * 1024 * 1024, duration: 16 }),
            {
              status: 200,
            },
          ),
        ),
      ) as unknown as typeof fetch;

      let caught: unknown;
      try {
        await service.verifyComplaintMedia(
          [],
          `https://res.cloudinary.com/${TEST_CONFIG.CLOUD_NAME}/video/upload/v1/complaints/long.mp4`,
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(UnprocessableEntityException);
    });

    it("rejects missing asset when Cloudinary Admin API reports missing resource", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(null, { status: 404 })),
      ) as unknown as typeof fetch;

      let caught: unknown;
      try {
        await service.verifyComplaintMedia([
          `https://res.cloudinary.com/${TEST_CONFIG.CLOUD_NAME}/image/upload/v1/complaints/missing.webp`,
        ]);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(UnprocessableEntityException);
    });

    it("fails closed when Cloudinary Admin API encounters upstream outage", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(null, { status: 503 })),
      ) as unknown as typeof fetch;

      let caught: unknown;
      try {
        await service.verifyComplaintMedia([
          `https://res.cloudinary.com/${TEST_CONFIG.CLOUD_NAME}/image/upload/v1/complaints/err.webp`,
        ]);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
    });
  });
});
