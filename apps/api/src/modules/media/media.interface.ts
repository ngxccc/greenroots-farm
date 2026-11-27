import type { MediaResourceType } from "./media.constant";

/**
 * Signed direct-upload parameters returned to clients for Cloudinary uploads.
 */
export interface CloudinarySignatureResult {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  resourceType: MediaResourceType;
  maxBytes: number;
  publicId?: string;
}
