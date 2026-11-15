import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from "@nestjs/common";
import { sha256 } from "@/common/utils/crypto.util";
import { env } from "@/common/config/env.config";
import {
  MEDIA_CONSTRAINTS,
  type CloudinarySignatureResult,
  type SignedUploadInput,
} from "./media.interface";

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  /**
   * Generates a signed upload signature for direct client-to-Cloudinary uploads.
   * Enforces INV-MEDIA-1 (<=5MB for images, <=15MB for videos).
   */
  createUploadSignature(input: SignedUploadInput): CloudinarySignatureResult {
    const { resourceType, fileSizeBytes, folder } = input;

    const maxAllowedBytes =
      resourceType === "video"
        ? MEDIA_CONSTRAINTS.VIDEO.MAX_BYTES
        : MEDIA_CONSTRAINTS.IMAGE.MAX_BYTES;

    if (fileSizeBytes > maxAllowedBytes) {
      const limitMb = maxAllowedBytes / (1024 * 1024);
      throw new UnprocessableEntityException(
        `Dung lượng tệp vượt quá giới hạn cho phép (${resourceType === "video" ? "Video" : "Ảnh"} <= ${limitMb}MB)`,
      );
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const cloudName = env.CLOUDINARY_CLOUD_NAME ?? "greenroots-dev";
    const apiKey = env.CLOUDINARY_API_KEY ?? "mock-api-key";
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
}
