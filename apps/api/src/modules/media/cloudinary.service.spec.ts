import { describe, expect, it } from "bun:test";
import { UnprocessableEntityException } from "@nestjs/common";
import { CloudinaryService } from "./cloudinary.service";
import { MEDIA_CONSTRAINTS } from "./media.interface";

describe("CloudinaryService Integration", () => {
  const service = new CloudinaryService();

  it("should generate signed upload signature for valid image (<=5MB) (INV-MEDIA-1)", () => {
    const validBytes = 4.5 * 1024 * 1024; // 4.5MB
    const result = service.createUploadSignature({
      resourceType: "image",
      fileSizeBytes: validBytes,
      folder: "farming_logs",
    });

    expect(result).toBeDefined();
    expect(result.resourceType).toBe("image");
    expect(result.folder).toBe("farming_logs");
    expect(result.maxBytes).toBe(MEDIA_CONSTRAINTS.IMAGE.MAX_BYTES);
    expect(result.signature).toBeDefined();
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it("should generate signed upload signature for valid video (<=15MB) (INV-MEDIA-1)", () => {
    const validBytes = 14 * 1024 * 1024; // 14MB
    const result = service.createUploadSignature({
      resourceType: "video",
      fileSizeBytes: validBytes,
      folder: "complaints",
    });

    expect(result).toBeDefined();
    expect(result.resourceType).toBe("video");
    expect(result.folder).toBe("complaints");
    expect(result.maxBytes).toBe(MEDIA_CONSTRAINTS.VIDEO.MAX_BYTES);
  });

  it("should reject image exceeding 5MB with 422 Unprocessable Entity (INV-MEDIA-1)", () => {
    const oversizedImageBytes = 5.2 * 1024 * 1024; // 5.2MB

    expect(() =>
      service.createUploadSignature({
        resourceType: "image",
        fileSizeBytes: oversizedImageBytes,
        folder: "products",
      }),
    ).toThrow(UnprocessableEntityException);
  });

  it("should reject video exceeding 15MB with 422 Unprocessable Entity (INV-MEDIA-1)", () => {
    const oversizedVideoBytes = 16 * 1024 * 1024; // 16MB

    expect(() =>
      service.createUploadSignature({
        resourceType: "video",
        fileSizeBytes: oversizedVideoBytes,
        folder: "complaints",
      }),
    ).toThrow(UnprocessableEntityException);
  });
});
