import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  API_ERROR_CODES,
  BUSINESS_RULES,
  type UserRole,
} from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import { sha256 } from "@/common/utils/crypto.util";
import { env } from "@/common/config/env.config";
import type { SignedUploadInput } from "./dto";
import {
  CLOUDINARY_ADMIN_API_BASE_URL,
  CLOUDINARY_ADMIN_REQUEST_TIMEOUT_MS,
  FOLDER_PERMISSIONS,
  MEDIA_CONSTRAINTS,
  type MediaResourceType,
} from "./media.constant";
import type { CloudinarySignatureResult } from "./media.interface";

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  /**
   * Generates a signed upload signature for direct client-to-Cloudinary uploads.
   * Enforces INV-MEDIA-1 (<=5MB for images, <=15MB for videos) and role-to-folder permissions.
   */
  createUploadSignature(
    input: SignedUploadInput,
    userRole?: UserRole,
  ): CloudinarySignatureResult {
    const { resourceType, fileSizeBytes, folder } = input;

    if (userRole) {
      const allowedRoles = FOLDER_PERMISSIONS[folder];
      if (!allowedRoles.includes(userRole)) {
        throw new ForbiddenException({
          code: API_ERROR_CODES.FORBIDDEN,
          detail: MESSAGES.MEDIA.FOLDER_ACCESS_DENIED,
        });
      }
    }

    const maxAllowedBytes =
      resourceType === "video"
        ? MEDIA_CONSTRAINTS.VIDEO.MAX_BYTES
        : MEDIA_CONSTRAINTS.IMAGE.MAX_BYTES;

    if (fileSizeBytes > maxAllowedBytes) {
      const limitMb = maxAllowedBytes / (1024 * 1024);
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.UNPROCESSABLE_ENTITY,
        detail: `File size exceeds the allowed limit (${resourceType === "video" ? "Video" : "Image"} <= ${limitMb}MB).`,
      });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const cloudName = env.CLOUDINARY_CLOUD_NAME;
    const apiKey = env.CLOUDINARY_API_KEY;
    const apiSecret = env.CLOUDINARY_API_SECRET;

    if (!apiSecret) {
      this.logger.warn(
        "CLOUDINARY_API_SECRET not set; returning mock upload signature for development",
      );
      return {
        signature: `mock-signature-${timestamp}`,
        timestamp,
        apiKey,
        cloudName,
        folder,
        resourceType,
        maxBytes: maxAllowedBytes,
      };
    }

    // Cloudinary signature calculation:
    // Sort parameters alphabetically: folder=...&timestamp=...
    const paramsToSign = [`folder=${folder}`, `timestamp=${timestamp}`].sort();
    const stringToSign = `${paramsToSign.join("&")}${apiSecret}`;
    const signature = sha256(stringToSign);
    return {
      signature,
      timestamp,
      apiKey,
      cloudName,
      folder,
      resourceType,
      maxBytes: maxAllowedBytes,
    };
  }

  /**
   * Verifies complaint proof images and optional video against Cloudinary's Admin Resource API
   * outside any database transaction, enforcing actual byte limits and `<= 15s` video duration.
   * Skips remote HTTP verification when `CLOUDINARY_API_SECRET` is unset in dev/test (`ADR-0009`).
   */
  async verifyComplaintMedia(
    imageUrls: readonly string[],
    videoUrl?: string | null,
  ): Promise<void> {
    if (!env.CLOUDINARY_API_SECRET) {
      this.logger.warn(
        "CLOUDINARY_API_SECRET not set; skipping remote Cloudinary metadata verification in development/test",
      );
      return;
    }

    const videoUrls = [videoUrl].filter(
      (url): url is string => typeof url === "string" && url.length > 0,
    );

    await Promise.all([
      ...imageUrls.map((url) => this.verifyRemoteAsset(url, "image")),
      ...videoUrls.map((url) => this.verifyRemoteAsset(url, "video")),
    ]);
  }

  private async verifyRemoteAsset(
    rawUrl: string,
    resourceType: MediaResourceType,
  ): Promise<void> {
    const publicId = this.extractPublicId(rawUrl, resourceType);
    if (!publicId) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.COMPLAINT_MEDIA_INVALID,
        detail: MESSAGES.COMPLAINTS.MEDIA_INVALID,
      });
    }

    const encodedPublicId = publicId
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const endpoint = `${CLOUDINARY_ADMIN_API_BASE_URL}/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/resources/${resourceType}/upload/${encodedPublicId}`;
    const basicAuth = Buffer.from(
      `${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET ?? ""}`,
    ).toString("base64");

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Basic ${basicAuth}`,
        },
        signal: AbortSignal.timeout(CLOUDINARY_ADMIN_REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException({
        code: API_ERROR_CODES.SERVICE_UNAVAILABLE,
        detail: MESSAGES.COMPLAINTS.MEDIA_SERVICE_UNAVAILABLE,
      });
    }

    if (response.status === 404) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.COMPLAINT_MEDIA_INVALID,
        detail: MESSAGES.COMPLAINTS.MEDIA_INVALID,
      });
    }

    if (!response.ok) {
      throw new ServiceUnavailableException({
        code: API_ERROR_CODES.SERVICE_UNAVAILABLE,
        detail: MESSAGES.COMPLAINTS.MEDIA_SERVICE_UNAVAILABLE,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ServiceUnavailableException({
        code: API_ERROR_CODES.SERVICE_UNAVAILABLE,
        detail: MESSAGES.COMPLAINTS.MEDIA_SERVICE_UNAVAILABLE,
      });
    }

    const record =
      typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>)
        : {};
    const bytes = record["bytes"];
    const duration = record["duration"];

    const maxBytes =
      resourceType === "video"
        ? MEDIA_CONSTRAINTS.VIDEO.MAX_BYTES
        : MEDIA_CONSTRAINTS.IMAGE.MAX_BYTES;

    if (typeof bytes !== "number" || bytes <= 0 || bytes > maxBytes) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.COMPLAINT_MEDIA_INVALID,
        detail: MESSAGES.COMPLAINTS.MEDIA_INVALID,
      });
    }

    if (
      resourceType === "video" &&
      (typeof duration !== "number" ||
        duration <= 0 ||
        duration > BUSINESS_RULES.COMPLAINT_VIDEO_MAX_SECONDS)
    ) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.COMPLAINT_MEDIA_INVALID,
        detail: MESSAGES.COMPLAINTS.MEDIA_INVALID,
      });
    }
  }

  private extractPublicId(
    rawUrl: string,
    resourceType: MediaResourceType,
  ): string | null {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return null;
    }

    const prefix = `/${env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload/`;
    if (!parsed.pathname.startsWith(prefix)) {
      return null;
    }

    const remainder = parsed.pathname.slice(prefix.length);
    const segments = remainder.split("/").filter(Boolean);
    const withoutVersion = /^v\d+$/.test(segments[0] ?? "")
      ? segments.slice(1)
      : segments;

    if (withoutVersion.length === 0) {
      return null;
    }

    const joined = withoutVersion.map((s) => decodeURIComponent(s)).join("/");
    return joined.replace(/\.[^./]+$/, "");
  }
}
