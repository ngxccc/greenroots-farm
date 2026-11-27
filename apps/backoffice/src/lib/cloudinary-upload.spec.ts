import { describe, expect, it } from "bun:test";
import {
  buildCloudinaryFormData,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  validateMediaFile,
} from "./cloudinary-upload";

describe("validateMediaFile", () => {
  it("accepts valid JPEG, PNG, and WebP images within 5MB", () => {
    // Invariant: INV-MEDIA-1
    expect(
      validateMediaFile({ size: 1024, type: "image/jpeg" }, "image"),
    ).toBeNull();
    expect(
      validateMediaFile({ size: MAX_IMAGE_BYTES, type: "image/png" }, "image"),
    ).toBeNull();
    expect(
      validateMediaFile({ size: 2048, type: "image/webp" }, "image"),
    ).toBeNull();
  });

  it("rejects empty files, unsupported MIME types, and oversized images", () => {
    // Invariant: INV-MEDIA-1
    expect(
      validateMediaFile({ size: 0, type: "image/jpeg" }, "image"),
    ).not.toBeNull();
    expect(
      validateMediaFile({ size: 1024, type: "image/gif" }, "image"),
    ).not.toBeNull();
    expect(
      validateMediaFile(
        { size: MAX_IMAGE_BYTES + 1, type: "image/png" },
        "image",
      ),
    ).not.toBeNull();
  });

  it("enforces video MIME types and 15MB ceiling", () => {
    // Invariant: INV-MEDIA-1
    expect(
      validateMediaFile({ size: MAX_VIDEO_BYTES, type: "video/mp4" }, "video"),
    ).toBeNull();
    expect(
      validateMediaFile(
        { size: MAX_VIDEO_BYTES + 1, type: "video/mp4" },
        "video",
      ),
    ).not.toBeNull();
    expect(
      validateMediaFile({ size: 1024, type: "image/jpeg" }, "video"),
    ).not.toBeNull();
  });
});

describe("buildCloudinaryFormData", () => {
  it("appends all signed Cloudinary parameters", () => {
    const formData = buildCloudinaryFormData(new Blob(["img"]), {
      signature: "sig-123",
      timestamp: 1731744000,
      apiKey: "key-abc",
      cloudName: "greenroots-farm",
      folder: "products",
      resourceType: "image",
      maxBytes: MAX_IMAGE_BYTES,
    });

    expect(formData.get("signature")).toBe("sig-123");
    expect(formData.get("timestamp")).toBe("1731744000");
    expect(formData.get("api_key")).toBe("key-abc");
    expect(formData.get("folder")).toBe("products");
    expect(formData.get("file")).toBeInstanceOf(Blob);
  });
});
