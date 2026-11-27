import { api, extractApiErrorMessage } from "@/lib/api-client";
import type { components } from "@/types/api-schema";

type SignedUploadDto = components["schemas"]["SignedUploadDto"];
type SignedUploadResponseDto = components["schemas"]["SignedUploadResponseDto"];

export type MediaFolder = SignedUploadDto["folder"];
export type MediaResourceType = SignedUploadDto["resourceType"];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 15 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const ALLOWED_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

/**
 * Result returned after a validated direct upload to Cloudinary.
 */
export interface UploadedMediaResult {
  readonly secureUrl: string;
  readonly publicId: string;
  readonly resourceType: MediaResourceType;
  readonly folder: MediaFolder;
}

/**
 * Validates file size and MIME type against the backend media boundary.
 *
 * @param file File selected by the operator.
 * @param resourceType Expected media type (`image` or `video`).
 * @returns Localized Vietnamese error message, or `null` when valid.
 */
export function validateMediaFile(
  file: Pick<File, "size" | "type">,
  resourceType: MediaResourceType = "image",
): string | null {
  if (file.size <= 0) {
    return "Tệp tải lên không hợp lệ (dung lượng bằng 0).";
  }

  if (resourceType === "image") {
    if (
      !ALLOWED_IMAGE_MIME_TYPES.includes(
        file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
      )
    ) {
      return "Chỉ hỗ trợ ảnh định dạng JPEG, PNG hoặc WebP.";
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return "Dung lượng ảnh tối đa là 5MB.";
    }
    return null;
  }

  if (
    !ALLOWED_VIDEO_MIME_TYPES.includes(
      file.type as (typeof ALLOWED_VIDEO_MIME_TYPES)[number],
    )
  ) {
    return "Chỉ hỗ trợ video định dạng MP4, MOV hoặc WebM.";
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return "Dung lượng video tối đa là 15MB.";
  }
  return null;
}

/**
 * Builds the multipart FormData payload required by Cloudinary's signed upload endpoint.
 *
 * @param file File to upload.
 * @param signed Signed credential payload from `/api/v1/media/upload-signature`.
 */
export function buildCloudinaryFormData(
  file: Blob,
  signed: SignedUploadResponseDto,
): FormData {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", signed.apiKey);
  formData.append("timestamp", String(signed.timestamp));
  formData.append("signature", signed.signature);
  formData.append("folder", signed.folder);
  return formData;
}

/**
 * Creates a validated `blob:` object URL for local image preview before upload.
 *
 * @param file Validated image file selected by the user.
 * @throws Error when the browser returns a non-`blob:` URL.
 */
export function createSafeBlobPreviewUrl(file: File): string {
  const url = URL.createObjectURL(file);
  if (!url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
    throw new Error("Đường dẫn xem trước ảnh không hợp lệ.");
  }
  return url;
}

/**
 * Requests a short-lived HMAC signature from the API and uploads the file directly to Cloudinary.
 *
 * @param file Browser `File` to upload.
 * @param folder Target Cloudinary folder authorized for the operator's role.
 * @param resourceType Expected media type (`image` by default).
 * @throws Error with a localized Vietnamese message when validation, signing, or upload fails.
 */
export async function uploadSignedMedia(
  file: File,
  folder: MediaFolder,
  resourceType: MediaResourceType = "image",
): Promise<UploadedMediaResult> {
  const validationError = validateMediaFile(file, resourceType);
  if (validationError) {
    throw new Error(validationError);
  }

  const { data, error } = await api.POST("/api/v1/media/upload-signature", {
    body: {
      folder,
      resourceType,
      fileSizeBytes: file.size,
    },
  });

  if (error) {
    throw new Error(
      extractApiErrorMessage(error, "Không thể tạo chữ ký tải tệp lên."),
    );
  }

  const signed = data.data;
  const uploadUrl = `https://api.cloudinary.com/v1_1/${signed.cloudName}/${resourceType}/upload`;
  const response = await globalThis.fetch(uploadUrl, {
    method: "POST",
    body: buildCloudinaryFormData(file, signed),
  });

  if (!response.ok) {
    throw new Error("Tải tệp lên Cloudinary thất bại. Vui lòng thử lại.");
  }

  const payload = (await response.json()) as {
    secure_url?: string;
    public_id?: string;
  };

  if (!payload.secure_url) {
    throw new Error("Cloudinary không trả về đường dẫn tệp hợp lệ.");
  }

  return {
    secureUrl: payload.secure_url,
    publicId: payload.public_id ?? "",
    resourceType,
    folder,
  };
}
