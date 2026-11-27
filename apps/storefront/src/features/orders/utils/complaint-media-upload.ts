import type { SignedUploadResponse } from "../schemas/complaint.schema";

/**
 * Safe user-facing error thrown by client-side complaint media upload steps.
 */
export class ComplaintMediaUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComplaintMediaUploadError";
  }
}

/**
 * Reads the duration of a browser `File` via `<video>` `loadedmetadata`.
 * Returns `null` when the browser cannot decode metadata, deferring enforcement
 * to backend Cloudinary Admin API verification.
 */
export function readVideoDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    if (!url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
      resolve(null);
      return;
    }
    const video = document.createElement("video");
    video.preload = "metadata";
    const cleanup = () => {
      URL.revokeObjectURL(url);
    };
    video.addEventListener(
      "loadedmetadata",
      () => {
        const duration = Number.isFinite(video.duration)
          ? video.duration
          : null;
        cleanup();
        resolve(duration);
      },
      { once: true },
    );
    video.addEventListener(
      "error",
      () => {
        cleanup();
        resolve(null);
      },
      { once: true },
    );
    video.src = url;
  });
}

async function requestSignedUploadParams(
  resourceType: "image" | "video",
  fileSizeBytes: number,
): Promise<SignedUploadResponse> {
  const response = await fetch("/api/media/upload-signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resourceType, fileSizeBytes }),
  });

  const json = (await response.json()) as {
    data?: SignedUploadResponse;
    message?: string;
  };

  if (!response.ok || !json.data) {
    throw new ComplaintMediaUploadError(
      json.message ?? "Không thể khởi tạo phiên tải tệp lên Cloudinary.",
    );
  }
  return json.data;
}

/**
 * Requests a Storefront BFF signature and uploads a complaint photo or video directly to Cloudinary.
 */
export async function uploadComplaintFileToCloudinary(
  file: File,
  resourceType: "image" | "video",
): Promise<string> {
  const signature = await requestSignedUploadParams(resourceType, file.size);

  if (signature.signature.startsWith("mock-signature-")) {
    const ext =
      file.name.split(".").pop()?.toLowerCase() ??
      (resourceType === "video" ? "mp4" : "webp");
    const randomId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now());
    const assetName = signature.publicId ?? `mock-${randomId}`;
    return `https://res.cloudinary.com/${signature.cloudName}/${resourceType}/upload/v${signature.timestamp}/${signature.folder}/${assetName}.${ext}`;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", signature.apiKey);
  formData.append("timestamp", String(signature.timestamp));
  formData.append("signature", signature.signature);
  formData.append("folder", signature.folder);
  if (signature.publicId) {
    formData.append("public_id", signature.publicId);
  }

  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${signature.cloudName}/${resourceType}/upload`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!uploadRes.ok) {
    throw new ComplaintMediaUploadError(
      "Tải tệp lên Cloudinary thất bại. Vui lòng thử lại.",
    );
  }

  const uploadJson = (await uploadRes.json()) as { secure_url?: string };
  if (!uploadJson.secure_url) {
    throw new ComplaintMediaUploadError(
      "Cloudinary không trả về đường dẫn tệp hợp lệ.",
    );
  }
  return uploadJson.secure_url;
}

/**
 * Best-effort cleanup of uploaded complaint media assets via the Storefront BFF
 * when complaint submission fails after direct Cloudinary upload.
 */
export async function cleanupComplaintMediaFromServer(
  imageUrls: readonly string[],
  videoUrl: string | null,
): Promise<void> {
  const targets: { url: string; resourceType: "image" | "video" }[] = [
    ...imageUrls.map((url) => ({ url, resourceType: "image" as const })),
    ...(videoUrl ? [{ url: videoUrl, resourceType: "video" as const }] : []),
  ];
  if (targets.length === 0) return;

  await Promise.allSettled(
    targets.map(({ url, resourceType }) => {
      const query = new URLSearchParams({ url, resourceType }).toString();
      return fetch(`/api/media/complaints?${query}`, { method: "DELETE" });
    }),
  );
}
